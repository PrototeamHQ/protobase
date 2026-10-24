import { inspect } from 'node:util'
import { describe, expect, it } from 'vitest'
import { generateVapidKeys } from './keys'
import { readVapidSettings } from './vapid-settings'

const pair = generateVapidKeys()
const other = generateVapidKeys()
const full = { PROTOBASE_VAPID_PUBLIC_KEY: pair.publicKey, PROTOBASE_VAPID_PRIVATE_KEY: pair.privateKey, PROTOBASE_VAPID_SUBJECT: 'mailto:admin@example.com' }

const failure = (env: Record<string, string | undefined>) => {
  try {
    readVapidSettings(env)
  } catch (error) {
    return error as Error
  }
  throw new Error('accepted')
}

describe('readVapidSettings', () => {
  it('turns Web Push off when none is set, or each is blank', () => {
    expect(readVapidSettings({})).toBeUndefined()
    expect(readVapidSettings({ PROTOBASE_VAPID_PUBLIC_KEY: '', PROTOBASE_VAPID_PRIVATE_KEY: '  ', PROTOBASE_VAPID_SUBJECT: '' })).toBeUndefined()
  })

  it('reads all three', () => {
    const settings = readVapidSettings(full)!
    expect(settings.publicKey).toBe(pair.publicKey)
    expect(settings.subject).toBe('mailto:admin@example.com')
    expect(settings.privateKey.type).toBe('private')
  })

  it('names the two missing variables when only the private key is set, never its value', () => {
    const error = failure({ PROTOBASE_VAPID_PRIVATE_KEY: pair.privateKey })
    expect(error.message).toContain('PROTOBASE_VAPID_PUBLIC_KEY and PROTOBASE_VAPID_SUBJECT')
    expect(error.message).not.toContain(pair.privateKey)
  })

  it('names the private key when only the public key is set', () => {
    expect(failure({ PROTOBASE_VAPID_PUBLIC_KEY: pair.publicKey }).message).toMatch(/^PROTOBASE_VAPID_PRIVATE_KEY and PROTOBASE_VAPID_SUBJECT must be set/)
  })

  it('counts a blank variable as missing', () => {
    expect(failure({ ...full, PROTOBASE_VAPID_SUBJECT: ' ' }).message).toMatch(/^PROTOBASE_VAPID_SUBJECT must be set/)
  })

  it.each([
    ['PROTOBASE_VAPID_PUBLIC_KEY', { PROTOBASE_VAPID_PUBLIC_KEY: 'AAAA' }],
    ['PROTOBASE_VAPID_PUBLIC_KEY', { PROTOBASE_VAPID_PUBLIC_KEY: pair.privateKey }],
    ['PROTOBASE_VAPID_PRIVATE_KEY', { PROTOBASE_VAPID_PRIVATE_KEY: 'not-a-key!' }],
    ['PROTOBASE_VAPID_PRIVATE_KEY', { PROTOBASE_VAPID_PRIVATE_KEY: Buffer.alloc(32).toString('base64url') }],
    ['PROTOBASE_VAPID_PRIVATE_KEY', { PROTOBASE_VAPID_PRIVATE_KEY: Buffer.alloc(32, 0xff).toString('base64url') }],
    ['PROTOBASE_VAPID_PUBLIC_KEY is not the public key of PROTOBASE_VAPID_PRIVATE_KEY', { PROTOBASE_VAPID_PRIVATE_KEY: other.privateKey }],
    ['PROTOBASE_VAPID_SUBJECT', { PROTOBASE_VAPID_SUBJECT: 'admin@example.com' }],
    ['PROTOBASE_VAPID_SUBJECT', { PROTOBASE_VAPID_SUBJECT: 'http://example.com' }],
  ])('stops naming %s without echoing a key', (name, change) => {
    const env = { ...full, ...change }
    const error = failure(env)
    expect(error.message.startsWith(name)).toBe(true)
    for (const value of [env.PROTOBASE_VAPID_PUBLIC_KEY, env.PROTOBASE_VAPID_PRIVATE_KEY]) expect(error.message).not.toContain(value)
  })

  it('prints no key material when the settings are logged or serialized', () => {
    const settings = readVapidSettings(full)!
    expect(JSON.stringify(settings)).not.toContain(pair.privateKey)
    expect(inspect(settings, { depth: 10 })).not.toContain(pair.privateKey)
  })
})
