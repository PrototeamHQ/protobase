import { describe, expect, it } from 'vitest'
import { callsAccess } from './calls-access'
import { checkCallsOptions } from './calls-options'

const backend = { kind: 'livekit' as const, url: 'wss://livekit.example.com', apiKey: 'key', apiSecret: 'secret' }

describe('calls in a function', () => {
  it('rejects a join in an app without calls', async () => {
    await expect(callsAccess(undefined).join({ call: 'standup', member: 'ann', publish: true })).rejects.toThrow('This app has no calls: configure calls: { backend } in protobase.config.ts')
  })

  it('rejects a join without a call or a member', async () => {
    await expect(callsAccess({ backend }).join({ call: '', member: 'ann', publish: true })).rejects.toThrow('calls.join needs the call, a non-empty string')
    await expect(callsAccess({ backend }).join({ call: 'standup', member: '', publish: true })).rejects.toThrow('calls.join needs the member, a non-empty string')
  })

  it('gives the events of the member\'s socket', async () => {
    const events = await callsAccess({ backend }).join({ call: 'standup', member: 'ann', publish: true })
    expect(Object.keys(events).sort()).toEqual(['onClose', 'onMessage', 'onOpen'])
  })
})

describe('the calls options', () => {
  it('take a LiveKit backend, or peer to peer', () => {
    expect(checkCallsOptions({ backend })).toEqual({ backend })
    expect(checkCallsOptions({ backend: { kind: 'peer', iceServers: [{ urls: ['stun:stun.example.com'] }] } })).toEqual({ backend: { kind: 'peer', iceServers: [{ urls: ['stun:stun.example.com'] }] } })
  })

  it('name what is wrong', () => {
    expect(() => checkCallsOptions({ backend: { ...backend, kind: 'mesh' } } as never)).toThrow(`calls.backend.kind must be 'livekit' or 'peer', not "mesh"`)
    expect(() => checkCallsOptions({ backend: { ...backend, apiSecret: '' } })).toThrow('calls.backend.apiSecret must be a non-empty string')
    expect(() => checkCallsOptions({ backend: { kind: 'peer', iceServers: [{ urls: 'stun:x' }] } } as never)).toThrow('calls.backend.iceServers must be a list')
    expect(() => checkCallsOptions({ backend: { ...backend, url: 'livekit.example.com' } })).toThrow('calls.backend.url must start with wss://, ws://, https:// or http://')
  })
})
