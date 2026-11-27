import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { eventsAddress, relaySocket, socketAddress } from './relay-socket'
import { fakeRelay } from './testing/fake-relay'

const setup = () => {
  const relay = fakeRelay()
  const ticket = vi.fn(async () => ({ ticket: `t${ticket.mock.calls.length}`, url: 'wss://relay.test/socket', channels: [] }))
  const heard = { opens: [] as boolean[], downs: 0, ended: [] as unknown[] }
  const socket = relaySocket({
    ticket,
    socket: relay.open,
    events: relay.open,
    retryDelay: () => 1000,
    final: () => false,
    onOpen: (_channels, again) => void heard.opens.push(again),
    onDown: () => void (heard.downs += 1),
    onEnded: (error) => void heard.ended.push(error),
    onFrame: () => {},
  })
  return { relay, socket, heard }
}

beforeEach(() => void vi.useFakeTimers())
afterEach(() => void vi.useRealTimers())

describe('relaySocket fallback', () => {
  it('addresses the stream over HTTP beside the WebSocket', () => {
    expect(eventsAddress('wss://relay.test/socket/', 't 1')).toBe('https://relay.test/socket/sse?vsn=2.0.0&ticket=t%201')
    expect(eventsAddress('ws://localhost:4000/socket', 't1')).toBe('http://localhost:4000/socket/sse?vsn=2.0.0&ticket=t1')
  })

  it('connects over server-sent events at once with a fresh ticket when the WebSocket closes before it opened, and stays on them', async () => {
    const { relay, socket, heard } = setup()
    socket.start()
    await vi.advanceTimersByTimeAsync(0)
    relay.latest().drop()
    await vi.advanceTimersByTimeAsync(0)
    expect(relay.sockets.map((open) => open.url)).toEqual([socketAddress('wss://relay.test/socket', 't1'), eventsAddress('wss://relay.test/socket', 't2')])
    expect(heard.downs).toBe(0)
    relay.latest().opened()
    relay.latest().drop()
    await vi.advanceTimersByTimeAsync(1000)
    expect(heard.opens).toEqual([false])
    expect(heard.downs).toBe(1)
    expect(relay.latest().url).toBe(eventsAddress('wss://relay.test/socket', 't3'))
  })

  it('gives up on a WebSocket that does not open within 2.5 seconds', async () => {
    const { relay, socket } = setup()
    socket.start()
    await vi.advanceTimersByTimeAsync(2499)
    expect(relay.sockets).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(relay.sockets[0]!.close).toHaveBeenCalled()
    expect(relay.latest().url).toBe(eventsAddress('wss://relay.test/socket', 't2'))
  })

  it('stays on WebSockets once one opened, trying again after the pause', async () => {
    const { relay, socket, heard } = setup()
    socket.start()
    await vi.advanceTimersByTimeAsync(0)
    relay.latest().opened()
    relay.latest().drop()
    await vi.advanceTimersByTimeAsync(1000)
    relay.latest().drop()
    await vi.advanceTimersByTimeAsync(1000)
    expect(relay.sockets.map((open) => open.url)).toEqual([1, 2, 3].map((n) => socketAddress('wss://relay.test/socket', `t${n}`)))
    expect(heard.downs).toBe(2)
  })

  it('takes a close with 1000 as final over either transport, as by stop', async () => {
    for (const blocked of [false, true]) {
      const { relay, socket, heard } = setup()
      socket.start()
      await vi.advanceTimersByTimeAsync(0)
      if (blocked) relay.latest().drop()
      await vi.advanceTimersByTimeAsync(0)
      relay.latest().opened()
      relay.latest().readyState = 3
      relay.latest().onclose?.({ code: 1000, reason: 'session closed' })
      await vi.advanceTimersByTimeAsync(60_000)
      expect(relay.sockets).toHaveLength(blocked ? 2 : 1)
      expect(heard.ended).toHaveLength(1)
      expect(heard.downs).toBe(0)
      socket.wake()
      await vi.advanceTimersByTimeAsync(0)
      expect(relay.sockets).toHaveLength(blocked ? 2 : 1)
    }
  })
})
