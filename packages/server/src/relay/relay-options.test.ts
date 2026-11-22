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

describe('checkRelayOptions of client events', () => {
  const typing = { schema: { type: 'object' }, maxBytes: 128, perSecond: 2, burst: 4 }
  const withEvents = (events: unknown) => ({ ...chatRelay, channels: { conversations: { events: events as Record<string, typeof typing> } } })

  it('takes events of the right shape', () => {
    expect(checkRelayOptions(withEvents({ typing })).channels.conversations?.events).toEqual({ typing })
  })

  it('refuses events that are no object, and names the relay keeps', () => {
    expect(() => checkRelayOptions(withEvents([typing]))).toThrow('realtime.relay.channels.conversations.events must be an object of events by name')
    expect(() => checkRelayOptions(withEvents({ phx_join: typing }))).toThrow('"phx_join" must be 1 to 64 bytes')
    expect(() => checkRelayOptions(withEvents({ presence: typing }))).toThrow('"presence" must be 1 to 64 bytes')
    expect(() => checkRelayOptions(withEvents({ ['e'.repeat(65)]: typing }))).toThrow('must be 1 to 64 bytes')
  })

  it('refuses a schema that is no JSON object', () => {
    expect(() => checkRelayOptions(withEvents({ typing: { ...typing, schema: true } }))).toThrow('realtime.relay.channels.conversations.events.typing.schema must be a JSON schema object')
    expect(() => checkRelayOptions(withEvents({ typing: { ...typing, schema: [] } }))).toThrow('schema must be a JSON schema object')
  })

  it('refuses a size outside 1 to 65536 and rates that are not positive', () => {
    for (const maxBytes of [0, 65537, 1.5]) expect(() => checkRelayOptions(withEvents({ typing: { ...typing, maxBytes } }))).toThrow('typing.maxBytes must be a whole number from 1 to 65536')
    expect(checkRelayOptions(withEvents({ typing: { ...typing, maxBytes: 65536, perSecond: 0.5 } }))).toBeTruthy()
    for (const perSecond of [0, -1, Infinity, Number.NaN]) expect(() => checkRelayOptions(withEvents({ typing: { ...typing, perSecond } }))).toThrow('typing.perSecond must be a positive number')
    for (const burst of [0, 1.5]) expect(() => checkRelayOptions(withEvents({ typing: { ...typing, burst } }))).toThrow('typing.burst must be a positive whole number')
  })
})
