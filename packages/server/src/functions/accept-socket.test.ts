import { Hono, type Context } from 'hono'
import type { UpgradeWebSocket } from 'hono/ws'
import { describe, expect, it, vi } from 'vitest'
import { socketAcceptor } from './accept-socket'
import { honorSocketMessageCaps, socketMessageCapOf } from './socket-message-cap'

const upgraded = new Response(null, { status: 299 })

// The acceptor of one request, made inside a real Hono context.
const acceptorFor = async (headers: Record<string, string>, upgradeWebSocket?: UpgradeWebSocket, env?: object) => {
  let acceptor!: ReturnType<typeof socketAcceptor>
  const app = new Hono()
  app.get('/', (c: Context) => {
    acceptor = socketAcceptor({ c, report: vi.fn(), ...(upgradeWebSocket && { upgradeWebSocket }) })
    return c.body(null)
  })
  await app.request('/', { headers }, env)
  return acceptor
}

// What node-server's upgrade hands the app: the Node request, and a ws server that applies the caps.
const upgradeEnv = () => {
  const wss = {}
  honorSocketMessageCaps(wss)
  return { incoming: {}, wss }
}

const fakeUpgrader = () => vi.fn(async () => upgraded) as unknown as UpgradeWebSocket & ReturnType<typeof vi.fn>

describe('socketAcceptor', () => {
  it('refuses a request that is no upgrade with a 426 problem', async () => {
    const { accept } = await acceptorFor({}, fakeUpgrader())
    expect(() => accept({})).toThrow(expect.objectContaining({ status: 426, slug: 'upgrade-required' }))
  })

  it('is an error on a host without WebSockets', async () => {
    const { accept } = await acceptorFor({ upgrade: 'websocket' })
    expect(() => accept({})).toThrow('This server does not accept WebSockets')
  })

  it('upgrades exactly once, when the function returned the accepted response', async () => {
    const upgrader = fakeUpgrader()
    const { accept, answer } = await acceptorFor({ upgrade: 'WebSocket' }, upgrader)
    expect(upgrader).not.toHaveBeenCalled()
    expect(await answer('chat', accept({}))).toBe(upgraded)
    expect(upgrader).toHaveBeenCalledTimes(1)
  })

  it('never upgrades once the function answered with another response', async () => {
    const upgrader = fakeUpgrader()
    const { accept, answer } = await acceptorFor({ upgrade: 'websocket' }, upgrader)
    accept({})
    expect(() => answer('chat', new Response('no'))).toThrow('The function "chat" accepted a WebSocket but answered with another response')
    expect(upgrader).not.toHaveBeenCalled()
  })

  it('leaves the response of a function that accepted nothing as it is', async () => {
    const upgrader = fakeUpgrader()
    const { answer } = await acceptorFor({ upgrade: 'websocket' }, upgrader)
    const response = new Response('plain')
    expect(answer('chat', response)).toBe(response)
    expect(upgrader).not.toHaveBeenCalled()
  })

  it('marks the upgrade\'s request with an accepted cap only when it upgrades', async () => {
    const env = upgradeEnv()
    const { accept, answer } = await acceptorFor({ upgrade: 'websocket' }, fakeUpgrader(), env)
    const accepted = accept({ maxMessageBytes: 1024 })
    expect(socketMessageCapOf(env.incoming)).toBeUndefined()
    await answer('chat', accepted)
    expect(socketMessageCapOf(env.incoming)).toBe(1024)
  })

  it('leaves the request unmarked without a cap', async () => {
    const env = upgradeEnv()
    const { accept, answer } = await acceptorFor({ upgrade: 'websocket' }, fakeUpgrader(), env)
    await answer('chat', accept({}))
    expect(socketMessageCapOf(env.incoming)).toBeUndefined()
  })

  it('never marks once the function answered with another response', async () => {
    const env = upgradeEnv()
    const { accept, answer } = await acceptorFor({ upgrade: 'websocket' }, fakeUpgrader(), env)
    accept({ maxMessageBytes: 1024 })
    expect(() => answer('chat', new Response('no'))).toThrow('accepted a WebSocket but answered with another response')
    expect(socketMessageCapOf(env.incoming)).toBeUndefined()
  })

  it.each([0, -1, 1.5, NaN, Infinity, null, '1024', 1024n, new Number(1024)])('refuses a cap of %s', async (bytes) => {
    const { accept } = await acceptorFor({ upgrade: 'websocket' }, fakeUpgrader(), upgradeEnv())
    expect(() => accept({ maxMessageBytes: bytes as number })).toThrow(TypeError)
  })

  it('refuses a cap on a host whose ws server would not apply it', async () => {
    const without = await acceptorFor({ upgrade: 'websocket' }, fakeUpgrader())
    expect(() => without.accept({ maxMessageBytes: 1024 })).toThrow("This server cannot cap a socket's messages")
    const bare = await acceptorFor({ upgrade: 'websocket' }, fakeUpgrader(), { incoming: {}, wss: {} })
    expect(() => bare.accept({ maxMessageBytes: 1024 })).toThrow("This server cannot cap a socket's messages")
    expect(() => bare.accept({})).not.toThrow()
  })

  it('refuses a second socket, so a capped one is never swapped for an uncapped one', async () => {
    const { accept } = await acceptorFor({ upgrade: 'websocket' }, fakeUpgrader(), upgradeEnv())
    accept({ maxMessageBytes: 1024 })
    expect(() => accept({})).toThrow('acceptWebSocket can only be called once')
  })
})
