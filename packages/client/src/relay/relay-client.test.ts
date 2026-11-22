import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { relayClient } from './relay-client'
import { heartbeatMs, socketAddress } from './relay-socket'
import { RelayRefusal, type RelayHandlers } from './relay-types'
import { fakeRelay } from './testing/fake-relay'

const ended = Object.assign(new Error('session ended'), { final: true })

const setup = (channels = ['conversations/7', 'conversations/8']) => {
  const relay = fakeRelay()
  const ticket = vi.fn(async () => ({ ticket: `t${ticket.mock.calls.length}`, url: 'wss://relay.test/socket', channels }))
  const client = relayClient({ ticket, socket: relay.open, retryDelay: () => 1000, final: (error) => error === ended })
  // Opens the latest socket and answers every join it sent with ok, but those `refused` names.
  const open = async (refused: string[] = []) => {
    await vi.advanceTimersByTimeAsync(0)
    relay.latest().opened()
    for (const frame of relay.latest().sent.filter((sent) => sent.event === 'phx_join')) relay.latest().reply(frame, refused.includes(frame.topic) ? 'error' : 'ok', refused.includes(frame.topic) ? 'unauthorized' : undefined)
    await vi.advanceTimersByTimeAsync(0)
  }
  const follower = () => {
    const heard = { notices: [] as unknown[], events: [] as unknown[], resyncs: 0, statuses: [] as string[] }
    const handlers: RelayHandlers = {
      onNotice: (notice) => heard.notices.push(notice),
      onEvent: (event) => heard.events.push(event),
      onResync: () => void (heard.resyncs += 1),
      onStatus: (status) => heard.statuses.push(status),
    }
    return { heard, handlers }
  }
  return { relay, ticket, client, open, follower }
}

beforeEach(() => void vi.useFakeTimers())
afterEach(() => void vi.useRealTimers())

describe('relayClient', () => {
  it('connects with a fresh ticket in the Phoenix V2 address, and joins the relay topic and every channel the ticket lists', async () => {
    const { relay, client, open } = setup()
    client.follow({})
    await open()
    expect(relay.latest().url).toBe(socketAddress('wss://relay.test/socket', 't1'))
    expect(relay.latest().url).toBe('wss://relay.test/socket/websocket?vsn=2.0.0&ticket=t1')
    expect(relay.latest().sent.filter((frame) => frame.event === 'phx_join').map((frame) => frame.topic)).toEqual(['relay', 'conversations/7', 'conversations/8'])
    expect(client.joined('conversations/7')).toBe(true)
    expect(client.status()).toBe('open')
  })

  it("hands every follower the notices and the others' events, and the app's own events apart", async () => {
    const { relay, client, open, follower } = setup()
    const one = follower()
    const two = follower()
    const published = vi.fn()
    client.follow(one.handlers)
    client.follow({ ...two.handlers, onPublished: published })
    await open()
    const notice = { kind: 'create', resource: 'messages', key: '42', channel: 'conversations/7', mentions: ['u2'] }
    relay.latest().frame({ joinRef: null, ref: null, topic: 'conversations/7', event: 'change', payload: notice })
    const typing = { from: { user: 'u2', connection: 'Zk3' }, channel: 'conversations/7', at: 1795200000000, event: 'typing', payload: { typing: true } }
    relay.latest().frame({ joinRef: null, ref: null, topic: 'conversations/7', event: 'client_event', payload: typing })
    relay.latest().frame({ joinRef: null, ref: null, topic: 'conversations/7', event: 'pinned', payload: { id: 1 } })
    expect(one.heard.notices).toEqual([notice])
    expect(two.heard.events).toEqual([typing])
    expect(published).toHaveBeenCalledWith({ channel: 'conversations/7', event: 'pinned', payload: { id: 1 } })
  })

  it('sends a channel event once joined, rejects with the relay\'s reason, and refuses one on a channel not joined', async () => {
    const { relay, client, open } = setup()
    client.follow({})
    await open(['conversations/8'])
    const sent = client.send('conversations/7', 'typing', { typing: true })
    const frame = relay.latest().sent.at(-1)!
    expect(frame).toMatchObject({ topic: 'conversations/7', event: 'typing', payload: { typing: true } })
    relay.latest().reply(frame, 'error', 'rate_limited')
    await expect(sent).rejects.toEqual(new RelayRefusal('rate_limited'))
    await expect(client.send('conversations/8', 'typing', { typing: true })).rejects.toEqual(new RelayRefusal('not_joined'))
  })

  it('sends a direct event on the relay topic, says what it views, and its presence', async () => {
    const { relay, client, open } = setup()
    client.follow({})
    await open()
    void client.direct('u2', 'ring', { call: 1 })
    client.view('conversations/7', ['thread:3'])
    client.presence('away')
    client.presence('away')
    expect(relay.latest().sent.slice(-3).map(({ topic, event, payload }) => ({ topic, event, payload }))).toEqual([
      { topic: 'relay', event: 'ring', payload: { to: 'u2', payload: { call: 1 } } },
      { topic: 'conversations/7', event: 'interest', payload: { viewing: ['thread:3'] } },
      { topic: 'relay', event: 'presence', payload: { status: 'away' } },
    ])
  })

  it('connects again with a new ticket after a drop, joins again with the interest and away kept, and tells followers to resync once', async () => {
    const { relay, ticket, client, open, follower } = setup()
    const one = follower()
    client.follow(one.handlers)
    await open()
    client.view('conversations/7', ['thread:3'])
    client.presence('away')
    relay.latest().drop()
    expect(client.status()).toBe('connecting')
    expect(client.joined('conversations/7')).toBe(false)
    await vi.advanceTimersByTimeAsync(1000)
    await open()
    expect(ticket).toHaveBeenCalledTimes(2)
    expect(relay.latest().url).toContain('ticket=t2')
    expect(relay.latest().sent.find((frame) => frame.topic === 'conversations/7' && frame.event === 'phx_join')?.payload).toEqual({ viewing: ['thread:3'] })
    expect(relay.latest().sent.some((frame) => frame.event === 'presence' && frame.payload.status === 'away')).toBe(true)
    expect(one.heard.resyncs).toBe(1)
    expect(one.heard.statuses).toEqual(['open', 'connecting', 'open'])
  })

  it('drops a socket whose heartbeat went unanswered, and keeps one that answers', async () => {
    const { relay, client, open } = setup()
    client.follow({})
    await open()
    await vi.advanceTimersByTimeAsync(heartbeatMs)
    const beat = relay.latest().sent.at(-1)!
    expect(beat).toMatchObject({ topic: 'phoenix', event: 'heartbeat' })
    relay.latest().reply(beat, 'ok')
    await vi.advanceTimersByTimeAsync(heartbeatMs)
    expect(relay.latest().close).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(heartbeatMs)
    expect(relay.latest().close).toHaveBeenCalled()
  })

  it('joins a channel asked for beyond the ticket, and again after a reconnect; a channel the relay closes is no longer joined', async () => {
    const { relay, client, open } = setup(['conversations/7'])
    client.follow({})
    await open()
    const leave = client.join('conversations/9')
    const join = relay.latest().sent.at(-1)!
    expect(join).toMatchObject({ topic: 'conversations/9', event: 'phx_join' })
    relay.latest().reply(join, 'ok')
    await vi.advanceTimersByTimeAsync(0)
    expect(client.joined('conversations/9')).toBe(true)
    relay.latest().frame({ joinRef: join.joinRef, ref: join.joinRef, topic: 'conversations/9', event: 'phx_close', payload: {} })
    expect(client.joined('conversations/9')).toBe(false)
    relay.latest().drop()
    await vi.advanceTimersByTimeAsync(1000)
    await open()
    expect(client.joined('conversations/9')).toBe(true)
    leave()
    relay.latest().drop()
    await vi.advanceTimersByTimeAsync(1000)
    await open()
    expect(relay.latest().sent.some((frame) => frame.topic === 'conversations/9')).toBe(false)
  })

  it('stays down once the app refuses a ticket for good, and tries again after any other failure', async () => {
    const { relay, ticket, client, follower } = setup()
    const one = follower()
    ticket.mockRejectedValueOnce(new Error('offline'))
    client.follow(one.handlers)
    await vi.advanceTimersByTimeAsync(0)
    expect(relay.sockets).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(1000)
    expect(relay.sockets).toHaveLength(1)
    relay.latest().drop()
    ticket.mockRejectedValueOnce(ended)
    await vi.advanceTimersByTimeAsync(1000)
    expect(one.heard.statuses.at(-1)).toBe('ended')
    await vi.advanceTimersByTimeAsync(60_000)
    expect(relay.sockets).toHaveLength(1)
  })

  it('connects at once on reconnect instead of waiting out the pause', async () => {
    const { relay, client, open } = setup()
    client.follow({})
    await open()
    relay.latest().drop()
    client.reconnect()
    await vi.advanceTimersByTimeAsync(0)
    expect(relay.sockets).toHaveLength(2)
  })

  it('opens one socket for every follower and closes it after the last', async () => {
    const { relay, client, open } = setup()
    const stopOne = client.follow({})
    const stopTwo = client.follow({})
    await open()
    expect(relay.sockets).toHaveLength(1)
    stopOne()
    expect(relay.latest().close).not.toHaveBeenCalled()
    stopTwo()
    expect(relay.latest().close).toHaveBeenCalledWith(1000)
  })
})
