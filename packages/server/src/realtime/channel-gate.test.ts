import { describe, expect, it, vi } from 'vitest'
import type { Caller } from '../api-keys/resolve-caller'
import type { ChannelAccess } from './channel-access'
import { privateGate, readRefusalText } from './channel-gate'

const alice: Caller = { role: 'authenticated', claims: { sub: 'alice' } }

// What Postgres raises from a policy whose function fails.
const policyError = Object.assign(new Error('boom'), { code: 'P0001' })

describe('privateGate', () => {
  it('checks the topic without its prefix, and presence only for a channel that listens to it', async () => {
    const read = vi.fn<ChannelAccess['read']>(async (_caller, _topic, extensions) => new Map(extensions.map((extension) => [extension, true])))
    const access: ChannelAccess = { read, write: async () => true }
    expect(await privateGate(access, 'realtime:room', false, () => {}).authorize(alice)).toBeUndefined()
    expect(await privateGate(access, 'realtime:room', true, () => {}).authorize(alice)).toBeUndefined()
    expect(read.mock.calls.map(([, topic, extensions]) => [topic, extensions])).toEqual([['room', ['broadcast']], ['room', ['broadcast', 'presence']]])
  })

  it('allows nothing when a policy fails, reports its error, and checks a failed write again', async () => {
    const report = vi.fn()
    const write = vi.fn<ChannelAccess['write']>().mockRejectedValueOnce(policyError).mockResolvedValueOnce(true)
    const failing = privateGate({ read: async () => Promise.reject(policyError), write }, 'realtime:room', false, report)
    expect(await failing.authorize(alice)).toBe('denied')
    expect(failing.hears('broadcast')).toBe(false)

    const gate = privateGate({ read: async () => new Map([['broadcast', true]]), write }, 'realtime:room', false, report)
    expect(await gate.authorize(alice)).toBeUndefined()
    expect(await gate.mayWrite(alice, 'broadcast')).toBe(false)
    expect(await gate.mayWrite(alice, 'broadcast')).toBe(true)
    expect(await gate.mayWrite(alice, 'broadcast')).toBe(true)
    expect(write).toHaveBeenCalledTimes(2)
    expect(report.mock.calls).toEqual([[policyError], [policyError]])
  })

  it('passes on an error that is not the database\'s', async () => {
    const gate = privateGate({ read: async () => Promise.reject(new TypeError('bug')), write: async () => true }, 'realtime:room', false, () => {})
    await expect(gate.authorize(alice)).rejects.toThrow('bug')
  })

  it('names the topic as Supabase does', () => {
    expect(readRefusalText('realtime:room', 'denied')).toBe('You do not have permissions to read from this Channel topic: room')
    expect(readRefusalText('realtime:room', 'revoked')).toBe('You no longer have permission to read from this Channel topic: room')
  })
})
