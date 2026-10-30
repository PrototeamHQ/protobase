import { describe, expect, it, vi } from 'vitest'
import type { Db } from '@protobase/query'
import type { FunctionCaller } from '../functions/define-function'
import type { FunctionRecords } from '../functions/records'
import { notFound } from '../problem'
import { callsAccess } from './calls-access'
import type { CallsService } from './calls-service-type'
import { checkCallsOptions } from './calls-options'
import { callsRuntime } from './calls-runtime'
import { memoryCallStore } from './testing/memory-call-store'

const backend = { kind: 'livekit' as const, url: 'wss://livekit.example.com', apiKey: 'key', apiSecret: 'secret' }
const record = { resource: 'meetings', key: 1 }

// Calls over the memory store, for a caller whose records say whether they read the meeting.
const access = (reads: () => Promise<unknown>, session: FunctionCaller['session'] = { user: { id: 'ann', roles: ['member'] } }) => {
  const runtime = callsRuntime({ db: {} as Db, timeoutMs: 1000, options: { backend: { kind: 'peer' } }, report: vi.fn(), store: memoryCallStore() })
  const service: CallsService = { runtime: async () => runtime, recordOf: (resource, key) => ({ resource, key: String(key) }) }
  const get = vi.fn(reads)
  const caller = { session, records: { get } as unknown as FunctionRecords }
  return { calls: callsAccess(service, async () => caller), get, runtime }
}

describe('calls in a function', () => {
  it('reject everything in an app without calls', async () => {
    const calls = callsAccess(undefined, async () => ({}) as FunctionCaller)
    await expect(calls.join({ record, member: 'ann', publish: true })).rejects.toThrow('This app has no calls: configure calls: { backend } in protobase.config.ts')
    await expect(calls.remove('1', 'ann')).rejects.toThrow('This app has no calls')
  })

  it('reject a join without a record or a member', async () => {
    const { calls } = access(async () => ({}))
    await expect(calls.join({ record: undefined as never, member: 'ann', publish: true })).rejects.toThrow('calls.join needs the record, { resource, key }')
    await expect(calls.join({ record, member: '', publish: true })).rejects.toThrow('calls.join needs the member, a non-empty string')
  })

  it("reject a member of a guest's form, so no function lets anyone in as a guest", async () => {
    const { calls, get } = access(async () => ({}))
    await expect(calls.join({ record, member: 'guest:7f1c2a4e-1b2c-4d3e-8f90-a1b2c3d4e5f6', publish: true })).rejects.toThrow('calls.join takes no member that starts with guest:')
    expect(get).not.toHaveBeenCalled()
  })

  it('let in only a caller who reads the record, and check it again every minute with the function\'s own check', async () => {
    const own = vi.fn()
    const { calls, get } = access(async () => ({ record: {}, etag: '1' }))
    const events = await calls.join({ record, member: 'ann', publish: true, recheck: own })
    expect(Object.keys(events).sort()).toEqual(['maxMessageBytes', 'onClose', 'onMessage', 'onOpen', 'recheck'])
    expect(get).toHaveBeenCalledWith('meetings', 1)
    await events.recheck!()
    expect(get).toHaveBeenCalledTimes(2)
    expect(own).toHaveBeenCalledOnce()

    const refused = access(async () => Promise.reject(notFound('No meetings with this key')))
    await expect(refused.calls.join({ record, member: 'ann', publish: true })).rejects.toThrow('No meetings with this key')
  })

  it('refuse a visitor without an account, before reading anything', async () => {
    const { calls, get } = access(async () => ({}), { user: { id: 'anonymous', roles: ['anonymous'] }, anonymous: true })
    await expect(calls.join({ record, member: 'anonymous', publish: true })).rejects.toThrow('Sign in to join a call')
    expect(get).not.toHaveBeenCalled()
  })

  it('give the record\'s calls, and remove a member from one', async () => {
    const { calls, runtime } = access(async () => ({}))
    expect(await calls.of(record)).toEqual([])
    expect(await calls.remove('1', 'bob')).toBe(false)
    expect(await runtime.of({ resource: 'meetings', key: '1' })).toEqual([])
  })
})

describe('the calls options', () => {
  it('take a LiveKit backend, or peer to peer, with their limits', () => {
    expect(checkCallsOptions({ backend })).toEqual({ backend })
    const peer = { backend: { kind: 'peer' as const, iceServers: [{ urls: ['stun:stun.example.com'] }], maxMembers: 4 }, maxMinutes: 90, processes: 'many' as const }
    expect(checkCallsOptions(peer)).toEqual(peer)
  })

  it('name what is wrong', () => {
    expect(() => checkCallsOptions({ backend: { ...backend, kind: 'mesh' } } as never)).toThrow(`calls.backend.kind must be 'livekit' or 'peer', not "mesh"`)
    expect(() => checkCallsOptions({ backend: { ...backend, apiSecret: '' } })).toThrow('calls.backend.apiSecret must be a non-empty string')
    expect(() => checkCallsOptions({ backend: { kind: 'peer', iceServers: [{ urls: 'stun:x' }] } } as never)).toThrow('calls.backend.iceServers must be a list')
    expect(() => checkCallsOptions({ backend: { ...backend, url: 'livekit.example.com' } })).toThrow('calls.backend.url must start with wss://, ws://, https:// or http://')
    expect(() => checkCallsOptions({ backend: { kind: 'peer', maxMembers: 1 } })).toThrow('calls.backend.maxMembers must be a whole number of at least 2, not 1')
    expect(() => checkCallsOptions({ backend, maxMinutes: 0 })).toThrow('calls.maxMinutes must be a whole number of minutes of at least 1, not 0')
    expect(() => checkCallsOptions({ backend, processes: 'two' } as never)).toThrow(`calls.processes must be 'one' or 'many', not "two"`)
  })
})
