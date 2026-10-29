import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { f, resource } from '@protobase/schema'
import { unauthorized } from '../problem'
import { broadcastHub } from '../realtime/broadcast-hub'
import { presenceHub } from '../realtime/presence-hub'
import { realtimeLimits } from '../realtime/realtime-limits'
import { buildRegistry } from '../registry'
import type { Session } from '../types'
import { channelBounds } from './channel-bounds'
import { channelRecord, type ChannelRecord } from './channel-name'
import type { ServerMessage } from './channel-protocol'
import { channelSocket } from './channel-socket'

const registry = buildRegistry([resource('rooms').table('rooms').fields({ id: f.integer(), name: f.text() }).primaryKey((r) => r.id)])

const sessionOf = (id: string): Session => ({ user: { id, roles: ['member'] } })

type Opened = ReturnType<typeof connect>

// Who may read which room: every room for each user, unless `denied` names it.
const denied = new Map<string, Set<string>>()
const readable = async (session: Session, record: ChannelRecord) => !denied.get(String(session.user.id))?.has(record.name)

const connect = (user: string, { broadcasts = broadcastHub(), presences = presenceHub(), buffered = (): number => 0, reauthenticate = async (_token?: string) => sessionOf(user) } = {}) => {
  const frames: ServerMessage[] = []
  const close = vi.fn()
  const socket = channelSocket({
    send: (frame) => frames.push(JSON.parse(frame as string) as ServerMessage),
    buffered,
    close,
    session: sessionOf(user),
    reauthenticate,
    record: (resourceName, key) => channelRecord(registry, resourceName, key),
    readable,
    broadcasts,
    presences,
    report: (error) => {
      throw error
    },
  })
  const send = async (message: unknown) => {
    socket.message(typeof message === 'string' ? message : JSON.stringify(message))
    await vi.advanceTimersByTimeAsync(0)
  }
  const of = <T extends ServerMessage['type']>(type: T) => frames.filter((frame): frame is Extract<ServerMessage, { type: T }> => frame.type === type)
  return { frames, close, socket, send, of }
}

// Two connections on one process's hubs.
const pair = () => {
  const hubs = { broadcasts: broadcastHub(), presences: presenceHub() }
  return [connect('alice', hubs), connect('bob', hubs)] as const
}

const join = (socket: Opened, key = '1', ref = 'j') => socket.send({ type: 'join', ref, resource: 'rooms', key })

beforeEach(() => {
  vi.useFakeTimers()
  denied.clear()
})
afterEach(() => vi.useRealTimers())

describe('channelSocket presence', () => {
  it('gives a joining connection the whole presence, then each join, update and leave as a diff, with the session\'s user', async () => {
    const [alice, bob] = pair()
    await join(alice)
    expect(alice.frames).toEqual([{ type: 'reply', ref: 'j', ok: true, channel: 'rooms/1' }, { type: 'presence', channel: 'rooms/1', entries: [] }])
    await alice.send({ type: 'track', ref: 't', channel: 'rooms/1', state: { status: 'online' } })
    await join(bob)
    const [whole] = bob.of('presence')
    expect(whole!.entries).toEqual([{ id: expect.any(String), user: 'alice', state: { status: 'online' } }])
    const aliceId = whole!.entries[0]!.id

    await bob.send({ type: 'track', ref: 't', channel: 'rooms/1', state: { status: 'online' } })
    const bobJoin = alice.of('presence_diff').at(-1)!
    expect(bobJoin).toMatchObject({ joins: [{ user: 'bob', state: { status: 'online' } }], updates: [], leaves: [] })

    await alice.send({ type: 'track', ref: 't2', channel: 'rooms/1', state: { status: 'away' } })
    expect(bob.of('presence_diff').at(-1)).toEqual({ type: 'presence_diff', channel: 'rooms/1', joins: [], updates: [{ id: aliceId, user: 'alice', state: { status: 'away' } }], leaves: [] })

    await alice.send({ type: 'untrack', ref: 'u', channel: 'rooms/1' })
    expect(bob.of('presence_diff').at(-1)).toEqual({ type: 'presence_diff', channel: 'rooms/1', joins: [], updates: [], leaves: [{ id: aliceId, user: 'alice', state: { status: 'away' } }] })
    expect(alice.of('reply').map((reply) => reply.ok)).toEqual([true, true, true, true])
  })

  it('stamps the session\'s user, whatever user the client puts in its state', async () => {
    const [alice, bob] = pair()
    await join(alice)
    await join(bob)
    await alice.send({ type: 'track', channel: 'rooms/1', state: { user: 'bob' }, user: 'bob' })
    expect(bob.of('presence_diff').at(-1)!.joins).toEqual([{ id: expect.any(String), user: 'alice', state: { user: 'bob' } }])
  })

  it('takes a leaving connection\'s presence out at once, as when its page closes', async () => {
    const [alice, bob] = pair()
    await join(alice)
    await alice.send({ type: 'track', channel: 'rooms/1', state: {} })
    await join(bob)
    alice.socket.closed()
    expect(bob.of('presence_diff').at(-1)!.leaves).toEqual([{ id: expect.any(String), user: 'alice', state: {} }])
  })

  it('closes a connection silent for the idle bound, as one whose network dropped, and its presence leaves', async () => {
    const [alice, bob] = pair()
    await join(alice)
    await alice.send({ type: 'track', channel: 'rooms/1', state: {} })
    await join(bob)
    for (let at = 0; at < channelBounds.idleMs; at += channelBounds.pingMs) {
      await bob.send({ type: 'ping' })
      await vi.advanceTimersByTimeAsync(channelBounds.pingMs)
    }
    expect(alice.close).toHaveBeenCalled()
    expect(bob.close).not.toHaveBeenCalled()
    expect(bob.of('presence_diff').at(-1)!.leaves).toHaveLength(1)
    expect(bob.of('pong').length).toBeGreaterThan(0)
  })

  it('takes a connection\'s presence out when it leaves the channel', async () => {
    const [alice, bob] = pair()
    await join(alice)
    await alice.send({ type: 'track', channel: 'rooms/1', state: {} })
    await join(bob)
    await alice.send({ type: 'leave', ref: 'l', channel: 'rooms/1' })
    expect(bob.of('presence_diff').at(-1)!.leaves).toHaveLength(1)
    expect(alice.of('reply').at(-1)).toEqual({ type: 'reply', ref: 'l', ok: true })
  })
})

describe('channelSocket broadcasts', () => {
  it('sends to the others on the channel with the sender\'s user, to itself only with self, and acknowledges only with ack', async () => {
    const [alice, bob] = pair()
    await join(alice)
    await join(bob)
    await join(bob, '2', 'j2')
    await alice.send({ type: 'send', ref: 's1', channel: 'rooms/1', event: 'typing', payload: { on: true }, user: 'bob' })
    expect(bob.of('broadcast')).toEqual([{ type: 'broadcast', channel: 'rooms/1', event: 'typing', payload: { on: true }, user: 'alice' }])
    expect(alice.of('broadcast')).toEqual([])
    expect(alice.of('reply').filter((reply) => reply.ref === 's1')).toEqual([])

    await alice.send({ type: 'send', ref: 's2', channel: 'rooms/1', event: 'typing', payload: { on: false }, self: true, ack: true })
    expect(alice.of('broadcast')).toEqual([{ type: 'broadcast', channel: 'rooms/1', event: 'typing', payload: { on: false }, user: 'alice' }])
    expect(alice.of('reply').at(-1)).toEqual({ type: 'reply', ref: 's2', ok: true })
    expect(bob.of('broadcast')).toHaveLength(2)
  })

  it('stops hearing a channel once left', async () => {
    const [alice, bob] = pair()
    await join(alice)
    await join(bob)
    await bob.send({ type: 'leave', channel: 'rooms/1' })
    await alice.send({ type: 'send', channel: 'rooms/1', event: 'typing', payload: {} })
    expect(bob.of('broadcast')).toEqual([])
  })
})

describe('channelSocket access', () => {
  it('refuses a record the caller may not read exactly as one that does not exist, or an unknown resource or key', async () => {
    // Room 2 is one alice may not read, and room 999 none there is: `recordReadable` answers both alike.
    denied.set('alice', new Set(['rooms/2', 'rooms/999']))
    const alice = connect('alice')
    await join(alice, '2', 'hidden')
    await join(alice, '999', 'missing')
    await alice.send({ type: 'join', ref: 'resource', resource: 'nothing', key: '1' })
    await alice.send({ type: 'join', ref: 'key', resource: 'rooms', key: 'not-a-number' })
    const errors = alice.of('reply').map((reply) => (reply.ok ? undefined : reply.error))
    expect(new Set(errors.map((error) => JSON.stringify(error)))).toEqual(new Set([JSON.stringify({ code: 'not-found', message: 'There is no such record' })]))
    expect(errors).toHaveLength(4)
  })

  it('names one channel by the key\'s own text, so 01 and 1 meet', async () => {
    const [alice, bob] = pair()
    await join(alice, '01')
    await join(bob, '1')
    await alice.send({ type: 'send', channel: 'rooms/1', event: 'e', payload: 1 })
    expect(bob.of('broadcast')).toHaveLength(1)
  })

  it('closes the channel of a member who lost read access within the recheck bound, so they neither see nor hear it', async () => {
    const [alice, bob] = pair()
    await join(alice)
    await alice.send({ type: 'track', channel: 'rooms/1', state: {} })
    await join(bob)
    denied.set('alice', new Set(['rooms/1']))
    await vi.advanceTimersByTimeAsync(channelBounds.recheckMs)
    expect(alice.of('closed')).toEqual([{ type: 'closed', channel: 'rooms/1', error: { code: 'not-found', message: 'There is no such record' } }])
    expect(bob.of('presence_diff').at(-1)!.leaves).toHaveLength(1)
    const heard = alice.frames.length
    await bob.send({ type: 'send', channel: 'rooms/1', event: 'e', payload: 1 })
    await bob.send({ type: 'track', channel: 'rooms/1', state: { again: true } })
    expect(alice.frames.slice(heard)).toEqual([])
  })

  it('checks a send against the read access again once the last check is older than the cache bound', async () => {
    const [alice, bob] = pair()
    await join(alice)
    await join(bob)
    denied.set('alice', new Set(['rooms/1']))
    await alice.send({ type: 'send', ref: 'cached', channel: 'rooms/1', event: 'e', payload: 1 })
    expect(bob.of('broadcast')).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(channelBounds.readCacheMs)
    await alice.send({ type: 'send', ref: 'checked', channel: 'rooms/1', event: 'e', payload: 2 })
    expect(bob.of('broadcast')).toHaveLength(1)
    expect(alice.of('reply').at(-1)).toMatchObject({ ref: 'checked', ok: false, error: { code: 'not-found' } })
  })

  it('closes the socket once its session signs in nobody, or someone else', async () => {
    const gone = connect('alice', { reauthenticate: async () => Promise.reject(unauthorized('Signed out')) })
    await vi.advanceTimersByTimeAsync(channelBounds.recheckMs)
    expect(gone.close).toHaveBeenCalledWith(1008)
    const swapped = connect('alice', { reauthenticate: async () => sessionOf('mallory') })
    await vi.advanceTimersByTimeAsync(channelBounds.recheckMs)
    expect(swapped.close).toHaveBeenCalledWith(1008)
  })

  it('checks the session with the last token the client handed over', async () => {
    const reauthenticate = vi.fn(async () => sessionOf('alice'))
    const alice = connect('alice', { reauthenticate })
    await alice.send({ type: 'token', token: 'fresh' })
    await vi.advanceTimersByTimeAsync(channelBounds.recheckMs)
    expect(reauthenticate).toHaveBeenCalledWith('fresh')
  })
})

describe('channelSocket limits', () => {
  const codeOf = (socket: Opened) => {
    const last = socket.frames.at(-1)!
    if (last.type === 'error') return last.error.code
    return last.type === 'reply' && !last.ok ? last.error.code : undefined
  }

  it('refuses a message that is not one, a channel not joined and one joined already', async () => {
    const alice = connect('alice')
    await alice.send('not json')
    expect(codeOf(alice)).toBe('invalid-message')
    await alice.send({ type: 'send', channel: 'rooms/1', event: 'e' })
    expect(codeOf(alice)).toBe('invalid-message')
    await alice.send({ type: 'track', ref: 't', channel: 'rooms/1', state: {} })
    expect(codeOf(alice)).toBe('not-joined')
    await join(alice)
    await join(alice)
    expect(codeOf(alice)).toBe('already-joined')
  })

  it('refuses a channel name or an event over 255 bytes', async () => {
    const textRooms = buildRegistry([resource('notes').table('notes').fields({ id: f.text() }).primaryKey((r) => r.id)])
    expect(channelRecord(textRooms, 'notes', 'x'.repeat(249))).toMatchObject({ name: `notes/${'x'.repeat(249)}` })
    expect(channelRecord(textRooms, 'notes', 'x'.repeat(250))).toBe('too-long')
    const alice = connect('alice')
    await join(alice)
    await alice.send({ type: 'send', ref: 's', channel: 'rooms/1', event: 'e'.repeat(256), payload: {} })
    expect(codeOf(alice)).toBe('event-too-long')
  })

  it('refuses joins over the rate and channels over the cap', async () => {
    const alice = connect('alice')
    for (let room = 1; room <= realtimeLimits.joinsPerSecond; room++) await join(alice, String(room), String(room))
    await join(alice, '1000', 'over')
    expect(codeOf(alice)).toBe('too-many-joins')
    await vi.advanceTimersByTimeAsync(1000)
    await join(alice, '1001', 'cap')
    expect(codeOf(alice)).toBe('too-many-channels')
  })

  it('refuses broadcasts and presence updates over the connection\'s rate, and broadcasts over the channel\'s', async () => {
    const hubs = { broadcasts: broadcastHub(), presences: presenceHub() }
    const alice = connect('alice', hubs)
    await join(alice)
    for (let n = 0; n < realtimeLimits.eventsPerSecond; n++) alice.socket.message(JSON.stringify({ type: 'send', channel: 'rooms/1', event: 'e', payload: n }))
    await alice.send({ type: 'send', ref: 'over', channel: 'rooms/1', event: 'e', payload: 0 })
    expect(codeOf(alice)).toBe('too-many-messages')

    await vi.advanceTimersByTimeAsync(1000)
    const others = Array.from({ length: realtimeLimits.topicBroadcastsPerSecond / realtimeLimits.eventsPerSecond + 1 }, (_, n) => connect(`user${n}`, hubs))
    for (const other of others) await join(other)
    for (const other of others.slice(0, -1)) for (let n = 0; n < realtimeLimits.eventsPerSecond; n++) other.socket.message(JSON.stringify({ type: 'send', channel: 'rooms/1', event: 'e', payload: n }))
    await vi.advanceTimersByTimeAsync(0)
    await others.at(-1)!.send({ type: 'send', ref: 'busy', channel: 'rooms/1', event: 'e', payload: 0 })
    expect(codeOf(others.at(-1)!)).toBe('channel-too-busy')
  })

  it('refuses presence updates over the window and a tracked state too large', async () => {
    const alice = connect('alice')
    await join(alice)
    await alice.send({ type: 'track', ref: 'big', channel: 'rooms/1', state: 'x'.repeat(realtimeLimits.maxPresenceBytes) })
    expect(codeOf(alice)).toBe('presence-too-large')
    for (let n = 1; n < realtimeLimits.presencePerWindow; n++) await alice.send({ type: 'track', ref: String(n), channel: 'rooms/1', state: n })
    await alice.send({ type: 'untrack', ref: 'over', channel: 'rooms/1' })
    expect(codeOf(alice)).toBe('too-many-presence-updates')
    // Pinging, as the client does, so the idle bound does not close it meanwhile.
    for (let waited = 0; waited < realtimeLimits.presenceWindowMs; waited += channelBounds.pingMs) {
      await alice.send({ type: 'ping' })
      await vi.advanceTimersByTimeAsync(channelBounds.pingMs)
    }
    await alice.send({ type: 'untrack', ref: 'again', channel: 'rooms/1' })
    expect(alice.frames.at(-1)).toEqual({ type: 'reply', ref: 'again', ok: true })
  })

  it('closes with 1009 for a frame over the cap, and with 1008 for a client that reads too slowly', async () => {
    const big = connect('alice')
    await big.send(JSON.stringify({ type: 'send', channel: 'rooms/1', event: 'e', payload: 'x'.repeat(realtimeLimits.maxFrameBytes) }))
    expect(big.close).toHaveBeenCalledWith(1009)
    const slow = connect('bob', { buffered: () => realtimeLimits.maxUnsentBytes + 1 })
    await slow.send({ type: 'ping' })
    expect(slow.close).toHaveBeenCalledWith(1008)
  })

  it('closes with 1008 a client that sends too much while earlier messages wait', async () => {
    let release = () => {}
    const presences = presenceHub()
    const held = { ...presences, ready: () => new Promise<void>((resolve) => (release = resolve)) }
    const alice = connect('alice', { presences: held })
    for (let n = 0; n <= realtimeLimits.maxQueuedMessages; n++) alice.socket.message(JSON.stringify({ type: 'join', resource: 'rooms', key: String(n) }))
    expect(alice.close).toHaveBeenCalledWith(1008)
    release()
  })
})
