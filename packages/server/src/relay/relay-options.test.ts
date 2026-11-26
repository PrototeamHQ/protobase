import { describe, expect, it } from 'vitest'
import { checkRelayOptions, relaySettings } from './relay-options'
import { chatRelay } from './testing/chat-models'

describe('checkRelayOptions', () => {
  it('takes options of the right shape', () => {
    expect(checkRelayOptions(chatRelay)).toBe(chatRelay)
  })

  it('refuses an address that is no http(s) URL', () => {
    expect(() => checkRelayOptions({ ...chatRelay, url: 'relay.example.com' })).toThrow('realtime.relay.url or PROTOBASE_REALTIME_URL must start with https:// or http://')
  })

  it('refuses an app id the relay would not take', () => {
    expect(() => checkRelayOptions({ ...chatRelay, app: 'Chat App' })).toThrow('realtime.relay.app or PROTOBASE_REALTIME_APP must be 1 to 64 of a-z')
  })

  it('refuses a key shorter than the relay takes', () => {
    expect(() => checkRelayOptions({ ...chatRelay, ticketKey: 'short' })).toThrow('realtime.relay.ticketKey or PROTOBASE_REALTIME_TICKET_KEY must be a string of at least 32 characters')
  })

  it('refuses options without channel resources', () => {
    expect(() => checkRelayOptions({ ...chatRelay, channels: {} })).toThrow('realtime.relay.channels must name at least one channel resource')
  })

  it("takes a members field that reaches the record's organization when null, and refuses any other value or key", () => {
    const listed = (members: object) => ({ ...chatRelay, channels: { channels: { members } } }) as never
    expect(() => checkRelayOptions(listed({ field: 'member_ids', organization: 'when-null' }))).not.toThrow()
    expect(() => checkRelayOptions(listed({ field: 'member_ids', organization: 'always' }))).toThrow("realtime.relay.channels.channels.members must be { resource, channel, user } or { field, organization?: 'when-null' }")
    expect(() => checkRelayOptions(listed({ field: 'member_ids', tenant: 'organization_id' }))).toThrow('realtime.relay.channels.channels.members must be')
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
    expect(() => checkRelayOptions({ ...chatRelay, presence: { ...presence, key: 'short' } })).toThrow('realtime.relay.presence.key or PROTOBASE_REALTIME_PRESENCE_KEY must be a string of at least 32 characters')
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
    for (const burst of [0, 1.5, 'many']) expect(() => checkRelayOptions(withEvents({ typing: { ...typing, burst } }))).toThrow('typing.burst must be a positive whole number')
  })

  it('takes limits read from the environment, which are text, as the numbers they write', () => {
    expect(checkRelayOptions(withEvents({ typing: { ...typing, maxBytes: '128', perSecond: '0.5', burst: '4' } }))).toBeTruthy()
    expect(() => checkRelayOptions(withEvents({ typing: { ...typing, maxBytes: '' } }))).toThrow('typing.maxBytes must be a whole number')
    expect(() => checkRelayOptions(withEvents({ typing: { ...typing, perSecond: '2/s' } }))).toThrow('typing.perSecond must be a positive number')
  })
})

describe('relaySettings', () => {
  const { url, app, apiKey, ticketKey, ...ownOptions } = chatRelay
  const env = { PROTOBASE_REALTIME_URL: 'https://relay.platform.example', PROTOBASE_REALTIME_APP: 'platform-chat', PROTOBASE_REALTIME_API_KEY: 'a'.repeat(32), PROTOBASE_REALTIME_TICKET_KEY: 'b'.repeat(32) }

  it("takes the address, id and keys the config leaves out from the platform's variables", () => {
    expect(relaySettings(ownOptions, env)).toEqual({ ...ownOptions, url: env.PROTOBASE_REALTIME_URL, app: 'platform-chat', apiKey: 'a'.repeat(32), ticketKey: 'b'.repeat(32) })
  })

  it('takes each one on its own, a value in the config winning', () => {
    expect(relaySettings({ ...ownOptions, url, apiKey }, env)).toEqual({ ...ownOptions, url, app: 'platform-chat', apiKey, ticketKey: 'b'.repeat(32) })
    expect(relaySettings(chatRelay, env)).toEqual(chatRelay)
  })

  it('names the key and its variable when neither sets it', () => {
    expect(() => relaySettings({ ...ownOptions, url, app, apiKey }, {})).toThrow('realtime.relay.ticketKey or PROTOBASE_REALTIME_TICKET_KEY must be a string of at least 32 characters')
    expect(() => relaySettings({ ...ownOptions, app, apiKey, ticketKey }, {})).toThrow('realtime.relay.url or PROTOBASE_REALTIME_URL must start with https:// or http://')
  })

  describe('of the presence key', () => {
    const presence = { resource: 'presences', user: 'user_id', status: 'status', at: 'since' }
    const withKey = { ...env, PROTOBASE_REALTIME_PRESENCE_KEY: 'p'.repeat(32) }

    it("takes the presence key from the platform's variable when the config leaves it out", () => {
      expect(relaySettings({ ...ownOptions, presence }, withKey).presence).toEqual({ ...presence, key: 'p'.repeat(32) })
    })

    it('keeps a key the config sets', () => {
      expect(relaySettings({ ...ownOptions, presence: { ...presence, key: 'c'.repeat(32) } }, withKey).presence?.key).toBe('c'.repeat(32))
    })

    it('names the key and its variable when neither sets it', () => {
      expect(() => relaySettings({ ...ownOptions, presence }, env)).toThrow('realtime.relay.presence.key or PROTOBASE_REALTIME_PRESENCE_KEY must be a string of at least 32 characters')
    })
  })
})
