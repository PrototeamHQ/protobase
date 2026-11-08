import { describe, expect, it } from 'vitest'
import { readRelaySettings } from '../notifications/relay/relay-settings'
import { newCredential, parseCredential, secretHash, secretMatches } from './credential'

describe('newCredential', () => {
  it('gives a credential the relay sender takes, bound to the origin, keeping only its secret\'s hash', () => {
    const { text, stored } = newCredential('https://a.example.com')
    expect(readRelaySettings({ PROTOBASE_PUSH_RELAY_URL: 'https://relay.example.com', PROTOBASE_PUSH_RELAY_CREDENTIAL: text })?.credential).toBe(text)
    const parsed = parseCredential(text)!
    expect(parsed.id).toBe(stored.id)
    expect(stored.origin).toBe('https://a.example.com')
    expect(stored.secretHash).toEqual(secretHash(parsed.secret))
    expect(JSON.stringify(stored)).not.toContain(parsed.secret)
    expect(newCredential('https://a.example.com').text).not.toBe(text)
  })
})

describe('parseCredential', () => {
  it('takes only <uuid>.<43 base64url characters>', () => {
    const { text } = newCredential('https://a.example.com')
    expect(parseCredential(text)).toBeDefined()
    for (const bad of ['', 'x', `${text}x`, text.slice(1), text.replace('.', '-'), text.toUpperCase(), `${text.split('.')[0]}.${'a'.repeat(42)}=`]) expect(parseCredential(bad)).toBeUndefined()
  })
})

describe('secretMatches', () => {
  it('matches the secret only', () => {
    const { text, stored } = newCredential('https://a.example.com')
    const { secret } = parseCredential(text)!
    expect(secretMatches(stored, secret)).toBe(true)
    expect(secretMatches(stored, `${secret.slice(0, -1)}${secret.endsWith('A') ? 'B' : 'A'}`)).toBe(false)
    expect(secretMatches(stored, '')).toBe(false)
  })
})
