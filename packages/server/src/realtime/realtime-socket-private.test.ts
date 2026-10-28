import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Caller } from '../api-keys/resolve-caller'
import { broadcastHub } from './broadcast-hub'
import type { ChannelAccess, Extension } from './channel-access'
import { presenceHub } from './presence-hub'
import { realtimeSocket } from './realtime-socket'

type Action = 'read' | 'write'

// Each token is its own user; a user missing from the policy may do nothing.
const callerOf = async (token: string | undefined): Promise<Caller> => (token ? { role: 'authenticated', claims: { sub: token } } : { role: 'anon', claims: { role: 'anon' } })
const userOf = (caller: Caller) => (caller.role === 'authenticated' ? caller.claims.sub! : caller.role)

const policyAccess = (policy: Record<string, string[]>): ChannelAccess & { checks: string[] } => {
  const checks: string[] = []
  const allows = (caller: Caller, topic: string, extension: Extension, action: Action) => (policy[userOf(caller)] ?? []).includes(`${action} ${extension} ${topic}`)
  return {
    checks,
    read: async (caller, topic, extensions) => {
      checks.push(`read ${userOf(caller)} ${topic}`)
      return new Map(extensions.map((extension) => [extension, allows(caller, topic, extension, 'read')]))
    },
    write: async (caller, topic, extension) => {
      checks.push(`write ${userOf(caller)} ${extension} ${topic}`)
      return allows(caller, topic, extension, 'write')
    },
  }
}

const open = (access: ChannelAccess, broadcasts = broadcastHub(), presences = presenceHub()) => {
  const frames: { event: string; payload: unknown }[] = []
  const socket = realtimeSocket({ vsn: '1.0.0', send: (frame) => frames.push(JSON.parse(frame as string)), buffered: () => 0, close: () => {}, resolve: callerOf, live: [], hub: { add: () => () => {} }, checkFilters: async () => undefined, broadcasts, presences, access, nextId: () => 1, report: (error) => { throw error } })
  // vsn 1.0.0, whose messages are objects, so a broadcast arrives as text.
  const send = async ([join_ref, ref, topic, event, payload]: unknown[]) => {
    socket.message(JSON.stringify({ join_ref, ref, topic, event, payload }))
    await vi.advanceTimersByTimeAsync(0)
  }
  return { frames, send }
}

const join = (token?: string) => ({ config: { private: true, broadcast: { ack: true, self: false }, presence: { key: token ?? 'anon', enabled: true } }, ...(token && { access_token: token }) })
const payloads = (frames: { event: string; payload: unknown }[]) => frames.map((frame) => [frame.event, frame.payload])

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('realtimeSocket on private channels', () => {
  it('lets a user the policies allow join, hear broadcasts and presence, and refuses the others with Supabase\'s message', async () => {
    const access = policyAccess({ alice: ['read broadcast room', 'read presence room', 'write broadcast room', 'write presence room'], bob: ['read broadcast room', 'read presence room'] })
    const broadcasts = broadcastHub()
    const presences = presenceHub()
    const alice = open(access, broadcasts, presences)
    const bob = open(access, broadcasts, presences)
    const anon = open(access, broadcasts, presences)
    await bob.send(['1', '1', 'realtime:room', 'phx_join', join('bob')])
    await anon.send(['1', '1', 'realtime:room', 'phx_join', join()])
    await alice.send(['1', '1', 'realtime:other', 'phx_join', join('alice')])
    await alice.send(['2', '2', 'realtime:room', 'phx_join', join('alice')])
    await alice.send(['2', '3', 'realtime:room', 'presence', { type: 'presence', event: 'track', payload: { online: true } }])
    await alice.send(['2', '4', 'realtime:room', 'broadcast', { type: 'broadcast', event: 'hi', payload: { text: 'Hi' } }])

    expect(payloads(anon.frames)).toEqual([['phx_reply', { status: 'error', response: { reason: 'Unauthorized: You do not have permissions to read from this Channel topic: room' } }]])
    expect(payloads(alice.frames).slice(0, 1)).toEqual([['phx_reply', { status: 'error', response: { reason: 'Unauthorized: You do not have permissions to read from this Channel topic: other' } }]])
    expect(payloads(bob.frames)).toEqual([
      ['phx_reply', { status: 'ok', response: { postgres_changes: [] } }],
      ['presence_state', {}],
      ['presence_diff', { joins: { alice: { metas: [{ online: true, phx_ref: '1' }] } }, leaves: {} }],
      ['broadcast', { type: 'broadcast', event: 'hi', payload: { text: 'Hi' } }],
    ])
    expect(access.checks).toEqual(['read bob room', 'read anon room', 'read alice other', 'read alice room', 'write alice presence room', 'write alice broadcast room'])
  })

  it('refuses a broadcast and a track the policies do not allow, relays neither, and checks each write once', async () => {
    const access = policyAccess({ alice: ['read broadcast room', 'read presence room'], bob: ['read broadcast room', 'read presence room'] })
    const broadcasts = broadcastHub()
    const presences = presenceHub()
    const alice = open(access, broadcasts, presences)
    const bob = open(access, broadcasts, presences)
    await alice.send(['1', '1', 'realtime:room', 'phx_join', join('alice')])
    await bob.send(['1', '1', 'realtime:room', 'phx_join', join('bob')])
    await alice.send(['1', '2', 'realtime:room', 'broadcast', { type: 'broadcast', event: 'hi', payload: {} }])
    await alice.send(['1', '3', 'realtime:room', 'broadcast', { type: 'broadcast', event: 'hi', payload: {} }])
    await alice.send(['1', '4', 'realtime:room', 'presence', { type: 'presence', event: 'track', payload: {} }])

    expect(payloads(alice.frames).slice(2)).toEqual([
      ['phx_reply', { status: 'error', response: { error: 'unauthorized' } }],
      ['phx_reply', { status: 'error', response: { error: 'unauthorized' } }],
      ['phx_reply', { status: 'error', response: {} }],
    ])
    expect(payloads(bob.frames)).toEqual([['phx_reply', { status: 'ok', response: { postgres_changes: [] } }], ['presence_state', {}]])
    expect(access.checks.filter((check) => check.startsWith('write'))).toEqual(['write alice broadcast room', 'write alice presence room'])
  })

  it('keeps a channel that may hear presence only from broadcasts, and the reverse', async () => {
    const access = policyAccess({ alice: ['read broadcast room', 'write broadcast room', 'write presence room'], bob: ['read presence room'] })
    const broadcasts = broadcastHub()
    const presences = presenceHub()
    const alice = open(access, broadcasts, presences)
    const bob = open(access, broadcasts, presences)
    await alice.send(['1', '1', 'realtime:room', 'phx_join', join('alice')])
    await bob.send(['1', '1', 'realtime:room', 'phx_join', join('bob')])
    await alice.send(['1', '2', 'realtime:room', 'presence', { type: 'presence', event: 'track', payload: {} }])
    await alice.send(['1', '3', 'realtime:room', 'broadcast', { type: 'broadcast', event: 'hi', payload: {} }])

    expect(payloads(alice.frames).map(([event]) => event)).toEqual(['phx_reply', 'phx_reply', 'phx_reply'])
    expect(payloads(bob.frames)).toEqual([
      ['phx_reply', { status: 'ok', response: { postgres_changes: [] } }],
      ['presence_state', {}],
      ['presence_diff', { joins: { alice: { metas: [{ phx_ref: '1' }] } }, leaves: {} }],
    ])
  })

  it('checks a new token again, ending the channel when it takes away a read', async () => {
    const policy: Record<string, string[]> = { alice: ['read broadcast room', 'read presence room', 'write broadcast room'], carol: ['read broadcast room'] }
    const access = policyAccess(policy)
    const { frames, send } = open(access)
    await send(['1', '1', 'realtime:room', 'phx_join', join('alice')])
    await send(['1', '2', 'realtime:room', 'broadcast', { type: 'broadcast', event: 'hi', payload: {} }])
    // The write is checked again under the new token.
    await send(['1', '3', 'realtime:room', 'access_token', { access_token: 'alice' }])
    await send(['1', '4', 'realtime:room', 'broadcast', { type: 'broadcast', event: 'hi', payload: {} }])
    await send(['1', '5', 'realtime:room', 'access_token', { access_token: 'carol' }])
    await send(['1', '6', 'realtime:room', 'broadcast', { type: 'broadcast', event: 'hi', payload: {} }])

    expect(access.checks).toEqual(['read alice room', 'write alice broadcast room', 'read alice room', 'write alice broadcast room', 'read carol room'])
    expect(payloads(frames).slice(-3)).toEqual([
      ['system', { extension: 'system', status: 'error', message: 'You no longer have permission to read from this Channel topic: room' }],
      ['phx_close', {}],
      ['phx_reply', { status: 'error', response: { reason: 'unmatched topic' } }],
    ])
  })

  it('keeps the public channels of a topic apart from its private ones, so neither hears the other\'s broadcasts or presence', async () => {
    const access = policyAccess({ alice: ['read broadcast room', 'read presence room', 'write broadcast room', 'write presence room'] })
    const broadcasts = broadcastHub()
    const presences = presenceHub()
    const alice = open(access, broadcasts, presences)
    const anon = open(access, broadcasts, presences)
    await alice.send(['1', '1', 'realtime:room', 'phx_join', join('alice')])
    await anon.send(['1', '1', 'realtime:room', 'phx_join', { config: { broadcast: { self: false }, presence: { key: 'anon', enabled: true } } }])
    await anon.send(['1', '2', 'realtime:room', 'presence', { type: 'presence', event: 'track', payload: {} }])
    await anon.send(['1', '3', 'realtime:room', 'broadcast', { type: 'broadcast', event: 'spoof', payload: {} }])
    await alice.send(['1', '2', 'realtime:room', 'presence', { type: 'presence', event: 'track', payload: {} }])
    await alice.send(['1', '3', 'realtime:room', 'broadcast', { type: 'broadcast', event: 'hi', payload: {} }])

    expect(payloads(alice.frames).map(([event]) => event)).toEqual(['phx_reply', 'presence_state', 'presence_diff', 'phx_reply', 'phx_reply'])
    expect(payloads(alice.frames)[1]).toEqual(['presence_state', {}])
    expect(payloads(anon.frames).map(([event]) => event)).toEqual(['phx_reply', 'presence_state', 'presence_diff', 'phx_reply'])
  })
})
