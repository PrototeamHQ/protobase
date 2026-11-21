import { describe, expect, it } from 'vitest'
import { checkRelayOptions } from './relay-options'
import { chatRelay } from './testing/chat-models'

describe('checkRelayOptions', () => {
  it('takes options of the right shape', () => {
    expect(checkRelayOptions(chatRelay)).toBe(chatRelay)
  })

  it('refuses an address that is no http(s) URL', () => {
    expect(() => checkRelayOptions({ ...chatRelay, url: 'relay.example.com' })).toThrow('realtime.relay.url must start with https:// or http://')
  })

  it('refuses an app id the relay would not take', () => {
    expect(() => checkRelayOptions({ ...chatRelay, app: 'Chat App' })).toThrow('realtime.relay.app must be 1 to 64 of a-z')
  })

  it('refuses a key shorter than the relay takes', () => {
    expect(() => checkRelayOptions({ ...chatRelay, ticketKey: 'short' })).toThrow('realtime.relay.ticketKey must be a string of at least 32 characters')
  })

  it('refuses options without channel resources', () => {
    expect(() => checkRelayOptions({ ...chatRelay, channels: {} })).toThrow('realtime.relay.channels must name at least one channel resource')
  })

  it('refuses members without their fields', () => {
    expect(() => checkRelayOptions({ ...chatRelay, channels: { conversations: { members: { resource: 'conversation_members', channel: '', user: 'user_id' } } } })).toThrow(
      'realtime.relay.channels.conversations.members must be { resource, channel, user }',
    )
  })

  it('refuses presence without its fields or with a short key', () => {
    const presence = { resource: 'presences', user: 'user_id', status: 'status', at: 'since', key: 'p'.repeat(32) }
    expect(checkRelayOptions({ ...chatRelay, presence }).presence).toBe(presence)
    expect(() => checkRelayOptions({ ...chatRelay, presence: { ...presence, at: '' } })).toThrow('realtime.relay.presence must be { resource, user, status, at, key }')
    expect(() => checkRelayOptions({ ...chatRelay, presence: { ...presence, key: 'short' } })).toThrow('realtime.relay.presence.key must be a string of at least 32 characters')
  })
})
