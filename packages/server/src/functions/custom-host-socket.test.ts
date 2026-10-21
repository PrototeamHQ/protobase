import { createAdaptorServer, upgradeWebSocket } from '@hono/node-server'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import WebSocket, { WebSocketServer } from 'ws'
import type { Db } from '@protobase/query'
import { createErrorHandler } from '../error-handler'
import type { FunctionRecords } from './records'
import { defineFunction } from './define-function'
import { functionRoutes } from './routes'

const cleanups: (() => void)[] = []
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()))

// A server of one's own: the function routes behind node-server's upgrade, on a ws server that does not apply caps.
const serveOwn = async (maxMessageBytes?: number) => {
  const opened = vi.fn()
  const received = vi.fn()
  const chat = defineFunction((_request, { acceptWebSocket }) => acceptWebSocket({ ...(maxMessageBytes !== undefined && { maxMessageBytes }), onOpen: opened, onMessage: received }))
  const app = functionRoutes({
    basePath: '/api/functions',
    functions: { chat },
    authenticate: (request) => {
      if (request.headers.get('authorization') !== 'Bearer ok') throw new Error('unexpected caller')
      return { user: { id: 1, roles: ['admin'] } }
    },
    access: {},
    db: {} as Db,
    records: () => ({}) as FunctionRecords,
    onError: createErrorHandler(() => {}),
    wake: () => {},
    upgradeWebSocket,
    report: () => {},
  })
  const http = createAdaptorServer({ fetch: app.fetch, websocket: { server: new WebSocketServer({ noServer: true }) } })
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve))
  cleanups.push(() => http.close())
  const client = new WebSocket(`ws://127.0.0.1:${(http.address() as AddressInfo).port}/api/functions/chat`, { headers: { authorization: 'Bearer ok' } })
  // Terminating a refused client emits an error, which is no failure here.
  client.on('error', () => {})
  cleanups.push(() => client.terminate())
  return { client, opened, received }
}

describe('a function socket on a server of its own', () => {
  it('refuses a socket with a message cap its ws server would ignore', async () => {
    const { client, opened, received } = await serveOwn(1024)
    const status = await new Promise((resolve) => client.once('unexpected-response', (_request, response) => resolve(response.statusCode)).once('open', () => resolve(101)))
    expect(status).toBe(500)
    expect(opened).not.toHaveBeenCalled()
    expect(received).not.toHaveBeenCalled()
  })

  it('still opens one without a cap', async () => {
    const { client, opened } = await serveOwn()
    await new Promise((resolve, reject) => client.once('open', resolve).once('error', reject))
    await vi.waitFor(() => expect(opened).toHaveBeenCalledTimes(1))
  })
})
