import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LiveChange } from '../live'
import { NetworkError } from '../network-error'
import type { Frame } from './phoenix-frame'
import { relayClient } from './relay-client'
import { pollMs, relayLive } from './relay-live'
import { fakeRelay } from './testing/fake-relay'

const setup = (tokens: (resource: string, read: number) => string | undefined = (resource, read) => `${resource}-token-${read}`) => {
  const relay = fakeRelay()
  const ticket = vi.fn(async () => ({ ticket: `t${ticket.mock.calls.length}`, url: 'wss://relay.test/socket', channels: ['people'] }))
  const client = relayClient({ ticket, socket: relay.open, events: relay.open, retryDelay: () => 1000, final: () => false })
  let reads = 0
  const token = vi.fn(async (resource: string) => tokens(resource, ++reads))
  const live = relayLive({ relay: client, token })
  const heard = { changes: [] as LiveChange[][], resyncs: 0 }
  const follow = (resources: string[], polled?: string[]) => live({ resources, ...(polled && { polled }), onChanges: (changes) => heard.changes.push(changes), onResync: () => void (heard.resyncs += 1) })
  const joins = (topic: string) => relay.latest().sent.filter((frame) => frame.topic === topic && frame.event === 'phx_join')
  // Answers every join not answered yet with ok, but those `refused` names, with the reason.
  const answered = new Set<Frame>()
  const answer = async (refused: Record<string, string> = {}) => {
    await vi.advanceTimersByTimeAsync(0)
    for (const frame of relay.latest().sent.filter((sent) => sent.event === 'phx_join' && !answered.has(sent))) {
      answered.add(frame)
      const reason = refused[frame.topic]
      relay.latest().reply(frame, reason ? 'error' : 'ok', reason)
    }
    await vi.advanceTimersByTimeAsync(0)
  }
  const open = async (refused?: Record<string, string>) => {
    await vi.advanceTimersByTimeAsync(0)
    relay.latest().opened()
    await answer(refused)
  }
  const send = (topic: string, event: string, payload: Record<string, unknown>) => relay.latest().frame({ joinRef: null, ref: null, topic, event, payload })
  return { relay, token, follow, heard, joins, answer, open, send }
}

const stale = (resource: string) => [{ resource, key: '', operation: 'update' }]

beforeEach(() => void vi.useFakeTimers())
afterEach(() => void vi.useRealTimers())

describe('relayLive', () => {
  it("joins a live query of each resource with its read's token, and reads the resource once more as its page read came first", async () => {
    const { follow, open, joins, heard } = setup()
    follow(['messages'])
    await open()
    expect(joins('live:messages').map((frame) => frame.payload)).toEqual([{ live: 'messages-token-1' }])
    expect(heard.changes).toEqual([stale('messages')])
  })

  it('tells the changes of a change entry by the resource and its key', async () => {
    const { follow, open, send, heard } = setup()
    follow(['messages'])
    await open()
    send('live:messages', 'change', { id: 'r1', cursor: 'c1', changes: [{ resource: 'messages', operation: 'insert', key: { id: 2 } }] })
    expect(heard.changes.at(-1)).toEqual([{ resource: 'messages', key: '2', operation: 'create' }])
  })

  it('joins again with a fresh token after the last cursor once the token expired', async () => {
    const { follow, open, send, joins, answer, heard } = setup()
    follow(['messages'])
    await open()
    send('live:messages', 'change', { id: 'r1', cursor: 'c1', changes: [] })
    send('live:messages', 'phx_close', { reason: 'expired' })
    await answer()
    expect(joins('live:messages').at(-1)!.payload).toEqual({ live: 'messages-token-2', cursor: 'c1' })
    expect(heard.changes).toEqual([stale('messages')])
  })

  it('starts from a new read after a gap, and reads the resource again', async () => {
    const { follow, open, send, joins, answer, heard } = setup()
    follow(['messages'])
    await open()
    send('live:messages', 'change', { id: 'r1', cursor: 'c1', changes: [] })
    send('live:messages', 'phx_close', { reason: 'gap' })
    await answer()
    expect(joins('live:messages').at(-1)!.payload).toEqual({ live: 'messages-token-2' })
    expect(heard.changes).toEqual([stale('messages'), stale('messages')])
  })

  it('reads the resource again every poll when the relay has no changes service', async () => {
    const { follow, open, heard } = setup()
    follow(['messages'])
    await open({ 'live:messages': 'changes_unavailable' })
    expect(heard.changes).toEqual([])
    await vi.advanceTimersByTimeAsync(pollMs * 2)
    expect(heard.changes).toEqual([stale('messages'), stale('messages')])
  })

  it('polls a resource whose read gives no token, and one whose token read got no answer', async () => {
    const { follow, open, joins, heard } = setup((resource) => {
      if (resource === 'offline') throw new NetworkError()
      return
    })
    follow(['notes', 'offline'])
    await open()
    expect(joins('live:notes')).toEqual([])
    await vi.advanceTimersByTimeAsync(pollMs)
    expect(heard.changes).toEqual([stale('notes'), stale('offline')])
  })

  it('tries the join again at each poll after a token read that got no answer, and stops polling once it joined', async () => {
    const { follow, open, answer, joins, heard } = setup((resource, read) => {
      if (read === 1) throw new NetworkError()
      return `${resource}-token-${read}`
    })
    follow(['messages'])
    await open()
    expect(joins('live:messages')).toEqual([])
    await vi.advanceTimersByTimeAsync(pollMs)
    await answer()
    expect(joins('live:messages').map((frame) => frame.payload)).toEqual([{ live: 'messages-token-2' }])
    await vi.advanceTimersByTimeAsync(pollMs)
    expect(heard.changes).toEqual([stale('messages'), stale('messages')])
  })

  it('does not try the join again for a resource whose read gives no token', async () => {
    const { follow, open, token } = setup(() => undefined)
    follow(['notes'])
    await open()
    await vi.advanceTimersByTimeAsync(pollMs * 2)
    expect(token).toHaveBeenCalledTimes(1)
  })

  it('polls while the changes service is lost, until its next change', async () => {
    const { follow, open, send, heard } = setup()
    follow(['messages'])
    await open()
    send('live:messages', 'phx_error', {})
    await vi.advanceTimersByTimeAsync(pollMs)
    expect(heard.changes).toEqual([stale('messages'), stale('messages')])
    send('live:messages', 'change', { id: 'r1', cursor: 'c1', changes: [] })
    await vi.advanceTimersByTimeAsync(pollMs)
    expect(heard.changes).toHaveLength(2)
  })

  it('polls a resource live from others without joining', async () => {
    const { follow, open, relay, heard } = setup()
    follow([], ['thread'])
    await open()
    expect(relay.latest().sent.filter((frame) => frame.topic.startsWith('live:'))).toEqual([])
    await vi.advanceTimersByTimeAsync(pollMs)
    expect(heard.changes).toEqual([stale('thread')])
  })

  it("reads again and joins with fresh tokens after the last cursor once the app refreshes the person's access", async () => {
    const { follow, open, send, joins, answer, heard } = setup()
    follow(['messages'])
    await open()
    send('live:messages', 'change', { id: 'r1', cursor: 'c1', changes: [] })
    send('people', 'refresh', {})
    await answer()
    expect(heard.resyncs).toBe(1)
    expect(joins('live:messages').at(-1)!.payload).toEqual({ live: 'messages-token-2', cursor: 'c1' })
  })

  it('tells the rings the app says changed as a change of the rings notice', async () => {
    const { follow, open, send, heard } = setup()
    follow([])
    await open()
    send('people', 'rings', {})
    expect(heard.changes).toEqual([[{ resource: '$rings', key: '', operation: 'update' }]])
  })

  it('polls while the socket is down, and joins again after the last cursor once it is back', async () => {
    const { follow, open, send, relay, joins, heard } = setup()
    follow(['messages'])
    await open()
    send('live:messages', 'change', { id: 'r1', cursor: 'c1', changes: [] })
    relay.latest().drop()
    await vi.advanceTimersByTimeAsync(pollMs)
    expect(heard.changes.at(-1)).toEqual(stale('messages'))
    await open()
    expect(joins('live:messages').at(-1)!.payload).toEqual({ live: 'messages-token-2', cursor: 'c1' })
    expect(heard.resyncs).toBe(1)
  })

  it('leaves the topic once its last follower stops, and closes the socket after the last', async () => {
    const { follow, open, relay } = setup()
    const first = follow(['messages'])
    const second = follow(['messages'])
    await open()
    first()
    expect(relay.latest().sent.filter((frame) => frame.event === 'phx_leave')).toEqual([])
    second()
    expect(relay.latest().sent.filter((frame) => frame.event === 'phx_leave').map((frame) => frame.topic)).toEqual(['live:messages'])
    expect(relay.latest().readyState).toBe(3)
  })
})
