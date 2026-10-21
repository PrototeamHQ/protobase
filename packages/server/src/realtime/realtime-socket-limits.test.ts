import { Buffer } from 'node:buffer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Caller } from '../api-keys/resolve-caller'
import { unauthorized } from '../problem'
import { broadcastHub, type BroadcastHub } from './broadcast-hub'
import { presenceHub, type PresenceHub } from './presence-hub'
import { realtimeLimits } from './realtime-limits'
import { realtimeSocket } from './realtime-socket'

const anon: Caller = { role: 'anon', claims: { role: 'anon' } }
const overCap = realtimeLimits.maxUnsentBytes + 1
const decoder = new TextDecoder()

// A frame as the client reads it: a text message, or a binary broadcast as `['broadcast', event, payload]`, a payload of
// bytes as its size.
const read = (frame: string | ArrayBuffer): unknown[] => {
  if (typeof frame === 'string') return JSON.parse(frame)
  const bytes = new Uint8Array(frame)
  const [, topicSize, eventSize, metadataSize, encoding] = bytes as unknown as number[]
  const eventStart = 5 + topicSize!
  const payload = bytes.subarray(eventStart + eventSize! + metadataSize!)
  return ['broadcast', decoder.decode(bytes.subarray(eventStart, eventStart + eventSize!)), encoding === 0 ? payload.length : JSON.parse(decoder.decode(payload))]
}

type Options = { broadcasts?: BroadcastHub; presences?: PresenceHub; buffered?: () => number; resolve?: (token: string | undefined) => Promise<Caller>; report?: (error: unknown) => void }

const open = ({ broadcasts = broadcastHub(), presences = presenceHub(), buffered = () => 0, resolve = async () => anon, report = (error) => { throw error } }: Options = {}) => {
  const frames: unknown[][] = []
  // How many frames the socket had sent when it was closed, with the code.
  const closes: [code: number | undefined, sent: number][] = []
  const socket = realtimeSocket({ vsn: '2.0.0', send: (frame) => frames.push(read(frame)), buffered, close: (code) => closes.push([code, frames.length]), resolve, live: [], hub: { add: () => () => {} }, broadcasts, presences, nextId: () => 1, report })
  const send = async (message: unknown[] | string | ArrayBuffer | object) => {
    socket.message(Array.isArray(message) ? JSON.stringify(message) : message)
    await vi.advanceTimersByTimeAsync(0)
  }
  const join = (topic = 'realtime:room', { key = 'me', token }: { key?: string; token?: string } = {}) => send(['1', 'j', topic, 'phx_join', { config: { presence: { key, enabled: true } }, ...(token && { access_token: token }) }])
  const broadcast = (n: unknown = 0, topic = 'realtime:room') => send(['1', 'b', topic, 'broadcast', { type: 'broadcast', event: 'e', payload: { n } }])
  const track = (payload: Record<string, unknown> = { n: 0 }, topic = 'realtime:room') => send(['1', 't', topic, 'presence', { type: 'presence', event: 'track', payload }])
  const replies = () => frames.filter((frame) => frame[3] === 'phx_reply').map((frame) => frame[4])
  const heard = () => frames.filter((frame) => frame[0] === 'broadcast').map((frame) => frame[2])
  const diffs = () => frames.filter((frame) => frame[3] === 'presence_diff').map((frame) => frame[4])
  const lastState = () => frames.filter((frame) => frame[3] === 'presence_state').at(-1)?.[4]
  return { socket, frames, closes, send, join, broadcast, track, replies, heard, diffs, lastState }
}

const refused = (reason: string) => ({ status: 'error', response: { reason } })
const ok = { status: 'ok', response: {} }

// A held token check, which the test lets through.
const held = () => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => (release = resolve))
  const resolve = vi.fn(async () => {
    await gate
    return anon
  })
  return { resolve, release: async () => (release(), await vi.advanceTimersByTimeAsync(0)) }
}

// A text broadcast of at least `bytes` bytes, padded with `char`; exactly `bytes` with a one-byte char.
const textOfBytes = (bytes: number, char = 'x') => {
  const frame = (pad: string) => JSON.stringify(['1', 'b', 'realtime:room', 'broadcast', { type: 'broadcast', event: 'e', payload: { pad } }])
  return frame(char.repeat(Math.ceil((bytes - Buffer.byteLength(frame(''))) / Buffer.byteLength(char))))
}

// realtime-js's binary broadcast push (kind 3) on `realtime:room` of exactly `bytes` bytes.
const binaryOfBytes = (bytes: number) => {
  const head = [3, 1, 1, 13, 1, 0, 0, ...new TextEncoder().encode('1brealtime:roome')]
  const frame = new Uint8Array(bytes)
  frame.set(head)
  return frame
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(Date.parse('2026-08-01T00:00:00Z'))
})
afterEach(() => vi.useRealTimers())

describe('realtimeSocket limits', () => {
  it('refuses a socket\'s broadcasts over its rate with an error, relaying none, until the next second', async () => {
    const broadcasts = broadcastHub()
    const [alice, bob] = [open({ broadcasts }), open({ broadcasts })]
    await alice.join()
    await bob.join()
    for (let n = 0; n <= realtimeLimits.eventsPerSecond; n++) await alice.broadcast(n)
    expect(bob.heard()).toHaveLength(realtimeLimits.eventsPerSecond)
    expect(alice.replies().at(-1)).toEqual(refused('Too many messages per second'))
    await vi.advanceTimersByTimeAsync(1000)
    await alice.broadcast('next')
    expect(bob.heard().at(-1)).toEqual({ n: 'next' })
  })

  it('takes only so many broadcasts into a topic each second, counting none a socket could not send there', async () => {
    const broadcasts = broadcastHub()
    const [alice, bob, carol, dan, stranger] = [open({ broadcasts }), open({ broadcasts }), open({ broadcasts }), open({ broadcasts }), open({ broadcasts })]
    for (const member of [alice, bob, carol, dan]) await member.join()
    await dan.join('realtime:elsewhere')
    for (let n = 0; n < 150; n++) await stranger.broadcast(n)
    expect(new Set(stranger.replies().map((reply) => JSON.stringify(reply)))).toEqual(new Set([JSON.stringify(refused('unmatched topic'))]))
    for (let n = 0; n < realtimeLimits.eventsPerSecond; n++) await dan.broadcast(n, 'realtime:elsewhere')
    await dan.broadcast('late')
    expect(dan.replies().at(-1)).toEqual(refused('Too many messages per second'))
    await alice.send(['1', 'b', 'realtime:room', 'broadcast', { type: 'broadcast', payload: {} }])
    await alice.send(['1', 'b', 'realtime:room', 'broadcast', { type: 'broadcast', event: 'e'.repeat(256), payload: {} }])
    expect(bob.heard()).toEqual([])

    for (let n = 0; n < 50; n++) await alice.broadcast(n)
    for (let n = 0; n < 50; n++) await carol.broadcast(n)
    await bob.broadcast('over')
    expect(bob.replies().at(-1)).toEqual(refused('Too many messages per second on this topic'))
    expect(bob.heard()).toHaveLength(100)
    for (const member of [alice, carol, dan]) expect(member.heard()).not.toContainEqual({ n: 'over' })
  })

  it('refuses presence pushes over their window per socket and topic, kept across a rejoin', async () => {
    const presences = presenceHub()
    const [alice, bob] = [open({ presences }), open({ presences })]
    await alice.join('realtime:room', { key: 'alice' })
    await bob.join('realtime:room', { key: 'bob' })
    for (let n = 0; n < realtimeLimits.presencePerWindow; n++) await alice.track({ n })
    const diffs = bob.diffs().length
    await alice.track({ n: 'over' })
    expect(alice.replies().at(-1)).toEqual(refused('Client presence rate limit exceeded'))
    expect(bob.diffs()).toHaveLength(diffs)

    await alice.send(['1', 'l', 'realtime:room', 'phx_leave', {}])
    await alice.join('realtime:room', { key: 'alice' })
    await alice.track({ n: 'rejoined' })
    expect(alice.replies().at(-1)).toEqual(refused('Client presence rate limit exceeded'))
    await vi.advanceTimersByTimeAsync(realtimeLimits.presenceWindowMs)
    await alice.track({ n: 'later' })
    expect(alice.replies().at(-1)).toEqual(ok)
    expect(bob.diffs().at(-1)).toEqual({ joins: { alice: { metas: [{ n: 'later', phx_ref: expect.any(String) }] } }, leaves: {} })
  })

  it('refuses a presence meta over its size in bytes', async () => {
    const presences = presenceHub()
    const [alice, bob] = [open({ presences }), open({ presences })]
    await alice.join()
    await bob.join()
    await alice.track({ text: 'x'.repeat(realtimeLimits.maxPresenceBytes) })
    await alice.track({ text: '€'.repeat(3_400) })
    expect(alice.replies().slice(-2)).toEqual([refused('Track message size exceeded'), refused('Track message size exceeded')])
    expect(bob.diffs()).toEqual([])
  })

  it('refuses a channel over the cap, and takes a rejoin, or a new topic after a leave', async () => {
    const alice = open()
    for (let n = 0; n < realtimeLimits.channelsPerSocket; n++) await alice.join(`realtime:${n}`)
    await vi.advanceTimersByTimeAsync(1000)
    await alice.join('realtime:more')
    expect(alice.replies().at(-1)).toEqual(refused('ChannelRateLimitReached: Too many channels'))
    await alice.join('realtime:0')
    expect(alice.replies().at(-1)).toEqual({ status: 'ok', response: { postgres_changes: [] } })
    await alice.send(['1', 'l', 'realtime:1', 'phx_leave', {}])
    await alice.join('realtime:more')
    expect(alice.replies().at(-1)).toEqual({ status: 'ok', response: { postgres_changes: [] } })
  })

  it('refuses a join over the socket\'s rate and leaves its channel as it was', async () => {
    const broadcasts = broadcastHub()
    const [alice, bob] = [open({ broadcasts }), open({ broadcasts })]
    for (let n = 0; n < realtimeLimits.joinsPerSecond; n++) await alice.join()
    expect(alice.replies().every((reply) => (reply as { status: string }).status === 'ok')).toBe(true)
    await alice.join()
    expect(alice.replies().at(-1)).toEqual(refused('ClientJoinRateLimitReached: Too many joins per second'))
    await bob.join()
    await bob.broadcast('still')
    expect(alice.heard()).toEqual([{ n: 'still' }])
    await vi.advanceTimersByTimeAsync(1000)
    await alice.join()
    expect(alice.replies().at(-1)).toEqual({ status: 'ok', response: { postgres_changes: [] } })
  })

  it('checks no token for a join it refuses, and counts joins whose token it refuses', async () => {
    const resolve = vi.fn(async () => anon)
    const alice = open({ resolve })
    for (let n = 0; n < realtimeLimits.channelsPerSocket; n++) await alice.join(`realtime:${n}`)
    await vi.advanceTimersByTimeAsync(1000)
    await alice.join('realtime:more')
    await alice.join(`realtime:${'x'.repeat(247)}`)
    for (let n = 2; n < realtimeLimits.joinsPerSecond; n++) await alice.join('realtime:more')
    await alice.join('realtime:0')
    expect(alice.replies().slice(-3)).toEqual([
      refused('ChannelRateLimitReached: Too many channels'),
      refused('ChannelRateLimitReached: Too many channels'),
      refused('ClientJoinRateLimitReached: Too many joins per second'),
    ])
    expect(alice.replies().at(-realtimeLimits.joinsPerSecond)).toEqual(refused('A topic is at most 255 bytes'))
    expect(resolve).toHaveBeenCalledTimes(realtimeLimits.channelsPerSocket)

    const forged = vi.fn(async () => {
      throw unauthorized('The bearer token is invalid or expired')
    })
    const mallory = open({ resolve: forged })
    for (let n = 0; n <= realtimeLimits.joinsPerSecond; n++) await mallory.join(`realtime:${n}`, { token: 'forged' })
    expect(forged).toHaveBeenCalledTimes(realtimeLimits.joinsPerSecond)
    expect(mallory.replies().at(-1)).toEqual(refused('ClientJoinRateLimitReached: Too many joins per second'))
  })

  it('refuses a topic over 255 bytes, measured in bytes', async () => {
    const alice = open()
    await alice.join(`realtime:${'x'.repeat(247)}`)
    await alice.track({}, `realtime:${'x'.repeat(247)}`)
    const euros = `realtime:${'€'.repeat(83)}`
    expect([euros.length, Buffer.byteLength(euros)]).toEqual([92, 258])
    await alice.join(euros)
    expect(alice.replies()).toEqual([refused('A topic is at most 255 bytes'), refused('unmatched topic'), refused('A topic is at most 255 bytes')])
  })

  it('takes no access token, and checks none, for a channel the socket has not joined', async () => {
    const resolve = vi.fn(async () => anon)
    const alice = open({ resolve })
    for (let n = 0; n < 200; n++) await alice.send(['1', 'a', `realtime:${n}`, 'access_token', { access_token: 'forged' }])
    expect(resolve).not.toHaveBeenCalled()
    expect(alice.replies()).toEqual(Array(200).fill(refused('unmatched topic')))
  })

  it('closes with 1009 for a frame over the size cap in bytes, of any kind, and relays nothing', async () => {
    const over = realtimeLimits.maxFrameBytes + 1
    const euros = textOfBytes(over, '€')
    expect(euros.length).toBeLessThan(realtimeLimits.maxFrameBytes)
    for (const frame of [textOfBytes(over), euros, binaryOfBytes(over).buffer, binaryOfBytes(over), new Blob([binaryOfBytes(over)]), { not: 'a frame' }]) {
      const broadcasts = broadcastHub()
      const [alice, bob] = [open({ broadcasts }), open({ broadcasts })]
      await alice.join()
      await bob.join()
      await alice.send(frame)
      await alice.broadcast('after')
      expect(alice.closes).toEqual([[1009, 2]])
      expect(bob.heard()).toEqual([])
    }

    const broadcasts = broadcastHub()
    const [alice, bob] = [open({ broadcasts }), open({ broadcasts })]
    await alice.join()
    await bob.join()
    await alice.send(textOfBytes(realtimeLimits.maxFrameBytes))
    await alice.send(binaryOfBytes(realtimeLimits.maxFrameBytes).buffer)
    expect(alice.closes).toEqual([])
    expect(bob.heard()).toHaveLength(2)
  })

  it('registers nothing for a join still checking its token when the socket closes, or when it goes silent', async () => {
    for (const end of ['closed', 'idle'] as const) {
      const [broadcasts, presences] = [broadcastHub(), presenceHub()]
      const { resolve, release } = held()
      const ghost = open({ broadcasts, presences, resolve })
      await ghost.join('realtime:room', { key: 'ghost' })
      await ghost.track({ here: true })
      if (end === 'closed') ghost.socket.closed()
      else await vi.advanceTimersByTimeAsync(60_000)
      const joins = [vi.spyOn(broadcasts, 'join'), vi.spyOn(presences, 'join')]
      await release()
      for (const join of joins) expect(join).not.toHaveBeenCalled()

      const carol = open({ broadcasts, presences })
      await carol.join('realtime:room', { key: 'carol' })
      await carol.broadcast('hello')
      expect(carol.lastState()).toEqual({})
      expect(ghost.frames).toEqual([])
      expect(ghost.closes).toEqual(end === 'closed' ? [] : [[undefined, 0]])
    }
  })

  it('closes with 1008 a client that leaves too much unread, which leaves both hubs', async () => {
    const [broadcasts, presences] = [broadcastHub(), presenceHub()]
    let unsent = 0
    const [alice, bob, carol] = [open({ broadcasts, presences }), open({ broadcasts, presences, buffered: () => unsent }), open({ broadcasts, presences })]
    await alice.join('realtime:room', { key: 'alice' })
    await bob.join('realtime:room', { key: 'bob' })
    await carol.join('realtime:room', { key: 'carol' })
    await bob.track({ status: 'online' })
    const sent = bob.frames.length
    unsent = overCap
    await alice.broadcast('hi')
    expect(bob.closes).toEqual([[1008, sent]])
    expect(bob.frames).toHaveLength(sent)
    expect(carol.heard()).toEqual([{ n: 'hi' }])
    expect(carol.diffs().at(-1)).toEqual({ joins: {}, leaves: { bob: { metas: [{ status: 'online', phx_ref: expect.any(String) }] } } })
    const dan = open({ broadcasts, presences })
    await dan.join('realtime:room', { key: 'dan' })
    expect(dan.lastState()).toEqual({})
  })

  it('leaves no ghost when the output cap trips inside a join or a track of the socket\'s own', async () => {
    const cases = {
      before: () => () => overCap,
      'after the first frame': (bob: { frames: unknown[] }) => () => (bob.frames.length > 0 ? overCap : 0),
      'on its own track': (bob: { frames: unknown[] }) => () => (bob.frames.length > 2 ? overCap : 0),
    }
    for (const [name, buffered] of Object.entries(cases)) {
      const [broadcasts, presences] = [broadcastHub(), presenceHub()]
      const timers = vi.getTimerCount()
      const box: { frames: unknown[] } = { frames: [] }
      const bob = open({ broadcasts, presences, buffered: () => buffered(box)(), resolve: async () => ({ role: 'authenticated', claims: { sub: 'bob', exp: Date.now() / 1000 + 600 } }) })
      box.frames = bob.frames
      await bob.join('realtime:room', { key: 'bob', token: 'bob' })
      const carol = open({ broadcasts, presences })
      await carol.join('realtime:room', { key: 'carol' })
      await carol.track({ status: 'online' })
      await bob.track({ status: 'online' })
      await carol.broadcast('hello')
      const dan = open({ broadcasts, presences })
      await dan.join('realtime:room', { key: 'dan' })

      expect(bob.closes, name).toHaveLength(1)
      expect(bob.closes[0]![0], name).toBe(1008)
      expect(bob.frames, name).toHaveLength(bob.closes[0]![1])
      expect(Object.keys(dan.lastState() as object), name).toEqual(['carol'])
      const bobJoins = carol.diffs().filter((diff) => 'bob' in (diff as { joins: object }).joins).length
      const bobLeaves = carol.diffs().filter((diff) => 'bob' in (diff as { leaves: object }).leaves).length
      expect(bobLeaves, name).toBe(bobJoins)
      expect(carol.diffs().at(-1), name).not.toHaveProperty('joins.bob')
      for (const member of [carol, dan]) member.socket.closed()
      expect(vi.getTimerCount(), name).toBe(timers)
    }
  })

  it('closes with 1008 a client whose unsent bytes are not a number', async () => {
    for (const amount of [NaN, undefined]) {
      const alice = open({ buffered: () => amount as number })
      await alice.join()
      expect(alice.closes).toEqual([[1008, 0]])
    }
  })

  it('closes each member over the output cap once when they close inside each other\'s deliveries', async () => {
    const [broadcasts, presences] = [broadcastHub(), presenceHub()]
    const over = new Set<string>()
    const member = (name: string) => {
      const socket = open({ broadcasts, presences, buffered: () => (over.has(name) ? overCap : 0) })
      return Object.assign(socket, { name })
    }
    const [alice, bob, carol, dan, erin] = ['alice', 'bob', 'carol', 'dan', 'erin'].map(member) as [ReturnType<typeof member>, ReturnType<typeof member>, ReturnType<typeof member>, ReturnType<typeof member>, ReturnType<typeof member>]
    for (const { join, track, name } of [alice, bob, carol, dan, erin]) {
      await join('realtime:room', { key: name })
      await track({ name })
    }
    const before = { carol: carol.frames.length }
    over.add('bob').add('dan')
    // Erin goes over once she has the broadcast.
    const erinFrames = erin.frames.length
    const push = erin.frames.push.bind(erin.frames)
    erin.frames.push = (...frames) => (over.add('erin'), push(...frames))
    await alice.broadcast('hi')

    for (const closed of [bob, dan, erin]) {
      expect(closed.closes.map(([code]) => code), closed.name).toEqual([1008])
      expect(closed.frames, closed.name).toHaveLength(closed.closes[0]![1])
    }
    expect(erin.frames).toHaveLength(erinFrames + 1)
    const carolSaw = carol.frames.slice(before.carol)
    expect(carolSaw.filter((frame) => frame[0] === 'broadcast')).toHaveLength(1)
    expect(carolSaw.filter((frame) => frame[3] === 'presence_diff').map((frame) => Object.keys((frame[4] as { leaves: object }).leaves))).toEqual([['bob'], ['dan'], ['erin']])
    const frank = open({ broadcasts, presences })
    await frank.join('realtime:room', { key: 'frank' })
    expect(Object.keys(frank.lastState() as object).sort()).toEqual(['alice', 'carol'])
  })

  it('closes with 1008 a socket with too many messages or bytes waiting, and runs none of them', async () => {
    const counted = held()
    const alice = open({ resolve: counted.resolve })
    await alice.join()
    for (let n = 1; n < realtimeLimits.maxQueuedMessages; n++) alice.socket.message(JSON.stringify([null, String(n), 'phoenix', 'heartbeat', {}]))
    expect(alice.closes).toEqual([])
    await alice.send([null, 'last', 'phoenix', 'heartbeat', {}])
    expect(alice.closes).toEqual([[1008, 0]])
    await counted.release()
    expect(alice.frames).toEqual([])

    const sized = held()
    const bob = open({ resolve: sized.resolve })
    await bob.join()
    const frames = Math.floor(realtimeLimits.maxQueuedBytes / realtimeLimits.maxFrameBytes)
    for (let n = 1; n < frames; n++) await bob.send(textOfBytes(realtimeLimits.maxFrameBytes))
    expect(bob.closes).toEqual([])
    await bob.send(textOfBytes(realtimeLimits.maxFrameBytes))
    expect(bob.closes).toEqual([[1008, 0]])
    await sized.release()
    expect(bob.frames).toEqual([])
  })

  it('puts the sender\'s broadcast that cannot be encoded on the sender alone', async () => {
    const broadcasts = broadcastHub()
    const report = vi.fn()
    const [alice, bob, carol] = [open({ broadcasts, report }), open({ broadcasts }), open({ broadcasts })]
    for (const member of [alice, bob, carol]) await member.join()
    const deep = '['.repeat(100_000) + ']'.repeat(100_000)
    await alice.send(`["1","b","realtime:room","broadcast",{"type":"broadcast","event":"e","payload":${deep}}]`)
    expect(alice.closes).toHaveLength(1)
    expect(report).toHaveBeenCalledTimes(1)
    await bob.broadcast('fine')
    expect(carol.heard()).toEqual([{ n: 'fine' }])
    expect([bob.closes, carol.closes]).toEqual([[], []])
  })

  it('takes a reconnect of every channel while its token checks wait', async () => {
    const { resolve, release } = held()
    const alice = open({ resolve })
    const topics = Array.from({ length: realtimeLimits.channelsPerSocket }, (_, n) => `realtime:${n}`)
    for (const topic of topics) alice.socket.message(JSON.stringify(['1', 'j', topic, 'phx_join', { config: { presence: { key: 'alice', enabled: true } }, access_token: 'token' }]))
    for (const topic of topics) alice.socket.message(JSON.stringify(['1', 'a', topic, 'access_token', { access_token: 'token' }]))
    alice.socket.message(JSON.stringify([null, 'h', 'phoenix', 'heartbeat', {}]))
    await release()
    for (const topic of topics) await alice.track({ online: true }, topic)
    expect(alice.closes).toEqual([])
    expect(alice.replies()).toHaveLength(2 * topics.length + 1)
    expect(alice.replies().every((reply) => (reply as { status: string }).status === 'ok')).toBe(true)
  })
})
