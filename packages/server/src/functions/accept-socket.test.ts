import { Hono, type Context } from 'hono'
import type { UpgradeWebSocket } from 'hono/ws'
import { describe, expect, it, vi } from 'vitest'
import { socketAcceptor } from './accept-socket'

const upgraded = new Response(null, { status: 299 })

// The acceptor of one request, made inside a real Hono context.
const acceptorFor = async (headers: Record<string, string>, upgradeWebSocket?: UpgradeWebSocket) => {
  let acceptor!: ReturnType<typeof socketAcceptor>
  const app = new Hono()
  app.get('/', (c: Context) => {
    acceptor = socketAcceptor({ c, report: vi.fn(), ...(upgradeWebSocket && { upgradeWebSocket }) })
    return c.body(null)
  })
  await app.request('/', { headers })
  return acceptor
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
})
