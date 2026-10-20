import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { f, resource } from '@protobase/schema'
import type { Caller } from '../api-keys/resolve-caller'
import { unauthorized } from '../problem'
import { buildRegistry } from '../registry'
import type { ChangeHub, ChangeSink } from './change-hub'
import { realtimeSocket } from './realtime-socket'

const { entries } = buildRegistry([resource('todos').table('todos').fields({ id: f.integer(), user_id: f.text() }).primaryKey((r) => r.id).live()])

const now = Date.parse('2026-08-01T00:00:00Z')
const alice = (exp: number): Caller => ({ role: 'authenticated', claims: { sub: 'alice', exp } })

const open = () => {
  const frames: unknown[] = []
  const sinks: ChangeSink[] = []
  const hub: ChangeHub = { add: (sink) => (sinks.push(sink), () => sinks.splice(sinks.indexOf(sink), 1)) }
  const close = vi.fn()
  const resolve = async (token: string | undefined) => {
    if (token === 'alice-1') return alice(now / 1000 + 60)
    if (token === 'alice-2') return alice(now / 1000 + 3600)
    if (token === undefined) return { role: 'anon', claims: { role: 'anon' } } as const
    throw unauthorized('The bearer token is invalid or expired')
  }
  let id = 0
  const socket = realtimeSocket({ vsn: '2.0.0', send: (frame) => frames.push(JSON.parse(frame)), close, resolve, live: entries, hub, nextId: () => ++id, report: (error) => { throw error }, now: () => Date.now() })
  const send = async (message: unknown[]) => {
    socket.message(JSON.stringify(message))
    await vi.advanceTimersByTimeAsync(0)
  }
  return { frames, sinks, close, socket, send }
}

const joinPayload = (token?: string) => ({ config: { broadcast: { self: false }, presence: { enabled: false }, postgres_changes: [{ event: 'INSERT', schema: 'public', table: 'todos', filter: 'user_id=eq.alice' }], private: false }, ...(token && { access_token: token }) })

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(now)
})
afterEach(() => vi.useRealTimers())

describe('realtimeSocket', () => {
  it('answers heartbeats, joins a channel with its bindings and sends its changes', async () => {
    const { frames, sinks, send } = open()
    await send([null, '1', 'phoenix', 'heartbeat', {}])
    await send(['2', '2', 'realtime:room', 'phx_join', joinPayload('alice-1')])
    expect(frames).toEqual([
      [null, '1', 'phoenix', 'phx_reply', { status: 'ok', response: {} }],
      ['2', '2', 'realtime:room', 'phx_reply', { status: 'ok', response: { postgres_changes: [{ id: 1, event: 'INSERT', schema: 'public', table: 'todos', filter: 'user_id=eq.alice' }] } }],
      ['2', null, 'realtime:room', 'system', { extension: 'postgres_changes', status: 'ok', message: 'Subscribed to PostgreSQL', channel: 'room' }],
    ])
    expect(sinks).toHaveLength(1)
    expect(sinks[0]!.caller()).toEqual(alice(now / 1000 + 60))
    sinks[0]!.send({ ids: [1], data: { schema: 'public', table: 'todos', commit_timestamp: 'now', type: 'INSERT', columns: [], record: { id: 1 }, errors: null } })
    expect(frames.at(-1)).toEqual(['2', null, 'realtime:room', 'postgres_changes', { ids: [1], data: expect.objectContaining({ record: { id: 1 } }) }])
  })

  it('refuses a bad token, a table that is not live, presence and an unknown topic', async () => {
    const { frames, sinks, send } = open()
    await send(['1', '1', 'realtime:a', 'phx_join', joinPayload('forged')])
    await send(['2', '2', 'realtime:b', 'phx_join', { config: { postgres_changes: [{ event: '*', schema: 'public', table: 'other' }] } }])
    await send(['3', '3', 'realtime:c', 'phx_join', { config: { presence: { enabled: true } } }])
    await send(['4', '4', 'realtime:d', 'broadcast', {}])
    expect(frames.map((frame) => (frame as unknown[])[4])).toEqual([
      { status: 'error', response: { reason: 'The bearer token is invalid or expired' } },
      { status: 'error', response: { reason: expect.stringMatching(/^Unable to subscribe to changes/) } },
      { status: 'error', response: { reason: 'Not implemented: presence' } },
      { status: 'error', response: { reason: 'unmatched topic' } },
    ])
    expect(sinks).toHaveLength(0)
  })

  it('takes a newer token on an open channel, and ends the channel when its token expires or is refused', async () => {
    const { frames, sinks, send } = open()
    await send(['1', '1', 'realtime:room', 'phx_join', joinPayload('alice-1')])
    await send(['1', '2', 'realtime:room', 'access_token', { access_token: 'alice-2' }])
    await vi.advanceTimersByTimeAsync(120_000)
    expect(sinks[0]!.caller()).toEqual(alice(now / 1000 + 3600))
    expect(frames).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(3600_000)
    expect(frames.slice(2)).toEqual([
      ['1', null, 'realtime:room', 'system', { extension: 'system', status: 'error', message: 'Token has expired' }],
      ['1', null, 'realtime:room', 'phx_close', {}],
    ])
    expect(sinks).toHaveLength(0)

    vi.setSystemTime(now)
    const second = open()
    await second.send(['1', '1', 'realtime:room', 'phx_join', joinPayload('alice-2')])
    await second.send(['1', '2', 'realtime:room', 'access_token', { access_token: 'forged' }])
    expect(second.frames.slice(2)).toEqual([
      ['1', null, 'realtime:room', 'system', { extension: 'system', status: 'error', message: 'The bearer token is invalid or expired' }],
      ['1', null, 'realtime:room', 'phx_close', {}],
    ])
    expect(second.sinks).toHaveLength(0)
  })

  it('leaves a channel, ends all on close, and closes a silent socket', async () => {
    const { frames, sinks, send, socket, close } = open()
    await send(['1', '1', 'realtime:a', 'phx_join', joinPayload()])
    await send(['2', '2', 'realtime:b', 'phx_join', joinPayload()])
    await send(['1', '3', 'realtime:a', 'phx_leave', {}])
    expect(frames.slice(-2)).toEqual([
      ['1', '3', 'realtime:a', 'phx_reply', { status: 'ok', response: {} }],
      ['1', '3', 'realtime:a', 'phx_close', {}],
    ])
    expect(sinks).toHaveLength(1)
    socket.closed()
    expect(sinks).toHaveLength(0)
    expect(close).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(close).not.toHaveBeenCalled()

    const silent = open()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(silent.close).toHaveBeenCalledTimes(1)
  })
})
