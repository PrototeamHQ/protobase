import { describe, expect, it } from 'vitest'
import { readRelaySettings } from './relay-settings'

const credential = 'relay-credential-0123456789'

describe('readRelaySettings', () => {
  it('is off when neither variable is set or both are blank', () => {
    expect(readRelaySettings({})).toBeUndefined()
    expect(readRelaySettings({ PROTOBASE_PUSH_RELAY_URL: ' ', PROTOBASE_PUSH_RELAY_CREDENTIAL: '' })).toBeUndefined()
  })

  it('reads the URL, with the send path going under its own path, and the credential', () => {
    expect(readRelaySettings({ PROTOBASE_PUSH_RELAY_URL: 'https://relay.example.com', PROTOBASE_PUSH_RELAY_CREDENTIAL: credential })).toEqual({ url: new URL('https://relay.example.com/'), credential })
    expect(readRelaySettings({ PROTOBASE_PUSH_RELAY_URL: 'https://relay.example.com/v1', PROTOBASE_PUSH_RELAY_CREDENTIAL: credential })!.url.href).toBe('https://relay.example.com/v1/')
  })

  it('stops when only one of the two is set', () => {
    expect(() => readRelaySettings({ PROTOBASE_PUSH_RELAY_URL: 'https://relay.example.com' })).toThrow('PROTOBASE_PUSH_RELAY_URL and PROTOBASE_PUSH_RELAY_CREDENTIAL must be set together, or neither')
    expect(() => readRelaySettings({ PROTOBASE_PUSH_RELAY_CREDENTIAL: credential })).toThrow('must be set together')
  })

  it('stops on a URL that is not https or carries a user, query or fragment', () => {
    for (const url of ['http://relay.example.com', 'relay.example.com', 'https://user:pass@relay.example.com', 'https://relay.example.com/?to=x', 'https://relay.example.com/#x']) {
      expect(() => readRelaySettings({ PROTOBASE_PUSH_RELAY_URL: url, PROTOBASE_PUSH_RELAY_CREDENTIAL: credential })).toThrow('PROTOBASE_PUSH_RELAY_URL is not an https URL')
    }
  })

  it('stops on a credential that is no bearer token, without naming its value', () => {
    for (const bad of ['short', 'has spaces in it, quite long', `${'a'.repeat(10)}\u0000${'a'.repeat(10)}`]) {
      const read = () => readRelaySettings({ PROTOBASE_PUSH_RELAY_URL: 'https://relay.example.com', PROTOBASE_PUSH_RELAY_CREDENTIAL: `x${bad}` })
      expect(read).toThrow('PROTOBASE_PUSH_RELAY_CREDENTIAL is not a bearer token')
      expect(read).not.toThrow(bad)
    }
  })
})
