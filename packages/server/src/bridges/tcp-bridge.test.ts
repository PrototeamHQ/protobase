import { createAdaptorServer, upgradeWebSocket } from '@hono/node-server'
import { connect, createServer, type AddressInfo, type Socket } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import WebSocket, { WebSocketServer } from 'ws'
import type { Db } from '@protobase/query'
import { bridgeSocketPath } from '@protobase/schema/internal'
import { createErrorHandler } from '../error-handler'
import { defineFunction } from '../functions/define-function'
import type { FunctionRecords } from '../functions/records'
import { functionRoutes } from '../functions/routes'
import { bridgeClosings } from './bridge-closings'
import type { BridgeTarget } from './bridge-target'
import { tcpBridge } from './tcp-bridge'
import { connectTcp } from './tcp-connect'

vi.mock('./tcp-connect', async (original) => {
  const actual = await original<typeof import('./tcp-connect')>()
  return { ...actual, connectTcp: vi.fn(actual.connectTcp) }
})

// The next bridge's connection to `port` waits until `connect` is called, as a slow target would; it then connects for real.
const holdNextConnection = (port: number) => {
  let release = () => {}
  const connection = new Promise<Socket>((resolve) => {
    release = () => {
      const socket = connect({ host: '127.0.0.1', port })
      socket.once('connect', () => resolve(socket))
    }
  })
  const asked = new Promise<void>((resolve) => {
    vi.mocked(connectTcp).mockImplementationOnce(() => {
      resolve()
      return connection
    })
  })
  return { asked, connect: () => (release(), connection) }
}

const cleanups: (() => void)[] = []
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()))

// A TCP service that sends back what it receives, and the connections it took.
const echoServer = async () => {
  const connections: Socket[] = []
  const server = createServer((socket) => {
    connections.push(socket)
    socket.on('error', () => {})
    socket.pipe(socket)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  cleanups.push(() => server.close())
  cleanups.push(() => connections.forEach((socket) => socket.destroy()))
  return { port: (server.address() as AddressInfo).port, connections }
}

// The app's function routes on a server of npm ws, with a bridge whose rule reads `allowed`; callers are `Bearer <user>`.
const serveBridge = async (allowed: Map<string, BridgeTarget>, now?: () => number) => {
  const bridge = tcpBridge({ target: (name, { session }) => (session.user.id === 'ann' ? allowed.get(name) : undefined), ...(now && { now }) })
  const app = functionRoutes({
    basePath: '/api/functions',
    functions: { console: defineFunction(bridge) },
    authenticate: (request) => ({ user: { id: request.headers.get('authorization')!.slice('Bearer '.length), roles: ['*'] } }),
    access: {},
    db: {} as Db,
    records: () => ({}) as FunctionRecords,
    channels: { broadcast: async () => {} },
    onError: createErrorHandler(() => {}),
    wake: () => {},
    decryptField: () => async () => null,
    upgradeWebSocket,
    report: () => {},
  })
  const http = createAdaptorServer({ fetch: app.fetch, websocket: { server: new WebSocketServer({ noServer: true }) } })
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve))
  cleanups.push(() => http.close())
  const origin = `127.0.0.1:${(http.address() as AddressInfo).port}`
  const askToken = async (user: string, target: string) => {
    const response = await fetch(`http://${origin}/api/functions/console`, { method: 'POST', headers: { authorization: `Bearer ${user}`, 'content-type': 'application/json' }, body: JSON.stringify({ target }) })
    return { status: response.status, body: (await response.json()) as { token: string; open_by: string; expires_at: string } }
  }
  const openSocket = (user: string, token: string) => {
    const client = new WebSocket(`ws://${origin}${bridgeSocketPath('/api/functions/console', token)}`, { headers: { authorization: `Bearer ${user}` } })
    client.on('error', () => {})
    cleanups.push(() => client.terminate())
    const opened = new Promise<number>((resolve) => client.once('open', () => resolve(101)).once('unexpected-response', (_request, response) => resolve(response.statusCode!)))
    const closed = new Promise<{ code: number; reason: string }>((resolve) => client.once('close', (code, reason) => resolve({ code, reason: reason.toString() })))
    return { client, opened, closed }
  }
  return { bridge, askToken, openSocket }
}

const nextMessage = (client: WebSocket) => new Promise<Buffer>((resolve) => client.once('message', (data) => resolve(data as Buffer)))

describe('tcpBridge', () => {
  it('passes bytes through to the target for a caller the rule allows', async () => {
    const echo = await echoServer()
    const { askToken, openSocket } = await serveBridge(new Map([['db', { host: '127.0.0.1', port: echo.port }]]))
    const { status, body } = await askToken('ann', 'db')
    expect(status).toBe(201)
    const { client, opened } = openSocket('ann', body.token)
    expect(await opened).toBe(101)
    const reply = nextMessage(client)
    client.send(Buffer.from([0, 1, 2, 255]))
    expect([...(await reply)]).toEqual([0, 1, 2, 255])
  })

  it('gives a caller the rule refuses no token and no connection', async () => {
    const echo = await echoServer()
    const { askToken } = await serveBridge(new Map([['db', { host: '127.0.0.1', port: echo.port }]]))
    expect((await askToken('bob', 'db')).status).toBe(404)
    expect((await askToken('ann', 'other')).status).toBe(404)
    expect(echo.connections).toHaveLength(0)
  })

  it('opens one bridge per token, for the caller it was issued to only', async () => {
    const echo = await echoServer()
    const { askToken, openSocket } = await serveBridge(new Map([['db', { host: '127.0.0.1', port: echo.port }]]))
    const first = (await askToken('ann', 'db')).body.token
    expect(await openSocket('ann', first).opened).toBe(101)
    expect(await openSocket('ann', first).opened).toBe(404)
    const second = (await askToken('ann', 'db')).body.token
    expect(await openSocket('carl', second).opened).toBe(404)
    expect(await openSocket('ann', second).opened).toBe(404)
    await vi.waitFor(() => expect(echo.connections).toHaveLength(1))
  })

  it('opens nothing with a token past its opening window, and closes the bridge once it expires', async () => {
    const echo = await echoServer()
    let at = Date.now()
    const { askToken, openSocket } = await serveBridge(new Map([['db', { host: '127.0.0.1', port: echo.port, expiresInSeconds: 1 }]]), () => at)
    const late = (await askToken('ann', 'db')).body.token
    at += 30_000
    expect(await openSocket('ann', late).opened).toBe(404)
    at = Date.now()
    const { opened, closed } = openSocket('ann', (await askToken('ann', 'db')).body.token)
    expect(await opened).toBe(101)
    expect(await closed).toEqual(bridgeClosings.expired)
  })

  it('closes an open bridge when the app withdraws its target, and the connection with it', async () => {
    const echo = await echoServer()
    const allowed = new Map([['db', { host: '127.0.0.1', port: echo.port }]])
    const { bridge, askToken, openSocket } = await serveBridge(allowed)
    const { opened, closed } = openSocket('ann', (await askToken('ann', 'db')).body.token)
    expect(await opened).toBe(101)
    allowed.delete('db')
    bridge.withdraw('db')
    expect(await closed).toEqual(bridgeClosings.withdrawn)
    await vi.waitFor(() => expect(echo.connections[0]!.destroyed).toBe(true))
  })

  it('closes the bridge when the service ends the connection', async () => {
    const echo = await echoServer()
    const { askToken, openSocket } = await serveBridge(new Map([['db', { host: '127.0.0.1', port: echo.port }]]))
    const { opened, closed } = openSocket('ann', (await askToken('ann', 'db')).body.token)
    expect(await opened).toBe(101)
    await vi.waitFor(() => expect(echo.connections).toHaveLength(1))
    echo.connections[0]!.end()
    expect(await closed).toEqual(bridgeClosings.serviceEnded)
  })

  it('answers a target nothing listens on with 502', async () => {
    const echo = await echoServer()
    const { askToken, openSocket } = await serveBridge(new Map([['db', { host: '127.0.0.1', port: 1 }]]))
    expect(await openSocket('ann', (await askToken('ann', 'db')).body.token).opened).toBe(502)
    expect(echo.connections).toHaveLength(0)
  })

  it('refuses a bridge whose grant expires while it connects, and closes the late connection', async () => {
    const echo = await echoServer()
    let at = Date.now()
    const { askToken, openSocket } = await serveBridge(new Map([['db', { host: '127.0.0.1', port: echo.port, expiresInSeconds: 1 }]]), () => at)
    const held = holdNextConnection(echo.port)
    const { opened } = openSocket('ann', (await askToken('ann', 'db')).body.token)
    await held.asked
    at += 1_000
    const late = await held.connect()
    expect(await opened).toBe(404)
    await vi.waitFor(() => expect(late.destroyed).toBe(true))
  })

  it('refuses a bridge whose target is withdrawn while it connects, and passes no bytes', async () => {
    const echo = await echoServer()
    const { bridge, askToken, openSocket } = await serveBridge(new Map([['db', { host: '127.0.0.1', port: echo.port }]]))
    const held = holdNextConnection(echo.port)
    const { client, opened } = openSocket('ann', (await askToken('ann', 'db')).body.token)
    const received = vi.fn()
    client.on('message', received)
    await held.asked
    bridge.withdraw('db')
    const late = await held.connect()
    expect(await opened).toBe(403)
    await vi.waitFor(() => expect(late.destroyed).toBe(true))
    expect(received).not.toHaveBeenCalled()
  })
})
