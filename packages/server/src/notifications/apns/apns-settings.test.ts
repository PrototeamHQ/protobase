import { generateKeyPairSync } from 'node:crypto'
import { inspect } from 'node:util'
import { describe, expect, it } from 'vitest'
import { apnsTestEnv } from '../testing/apns-service'
import { pemWithLineBreaks, readApnsSettings } from './apns-settings'

const full = apnsTestEnv()

const failure = (env: Record<string, string | undefined>) => {
  try {
    readApnsSettings(env)
  } catch (error) {
    return error as Error
  }
  throw new Error('accepted')
}

const values = Object.values(full)
const namesNoValue = (error: Error) => values.every((value) => !error.message.includes(value) && !error.message.includes(value.split('\n')[1]!))

describe('readApnsSettings', () => {
  it('turns APNs off when none is set, or each is blank', () => {
    expect(readApnsSettings({})).toBeUndefined()
    expect(readApnsSettings({ PROTOBASE_APNS_KEY: ' ', PROTOBASE_APNS_KEY_ID: '', PROTOBASE_APNS_TEAM_ID: '' })).toBeUndefined()
  })

  it('reads all three, keeping the key as one that prints no key material', () => {
    const settings = readApnsSettings(full)!
    expect(settings.keyId).toBe('ABC123DEFG')
    expect(settings.teamId).toBe('TEAM123456')
    expect(settings.key.type).toBe('private')
    expect(inspect(settings)).not.toContain(full.PROTOBASE_APNS_KEY.split('\n')[1])
    expect(JSON.stringify(settings)).not.toContain(full.PROTOBASE_APNS_KEY.split('\n')[1])
  })

  it.each([
    ['spaces for its line breaks', (pem: string) => pem.trim().replace(/\n/g, ' ')],
    ['no line breaks at all', (pem: string) => pem.replace(/\n/g, '')],
  ])('reads a key pasted on one line with %s', (_, oneLine) => {
    const key = oneLine(full.PROTOBASE_APNS_KEY)
    expect(key).not.toContain('\n')
    const settings = readApnsSettings({ ...full, PROTOBASE_APNS_KEY: key })!
    const expected = readApnsSettings(full)!.key
    expect(settings.key.equals(expected)).toBe(true)
  })

  it.each([
    [['PROTOBASE_APNS_KEY'], 'PROTOBASE_APNS_KEY must be set'],
    [['PROTOBASE_APNS_KEY_ID'], 'PROTOBASE_APNS_KEY_ID must be set'],
    [['PROTOBASE_APNS_TEAM_ID'], 'PROTOBASE_APNS_TEAM_ID must be set'],
    [['PROTOBASE_APNS_KEY', 'PROTOBASE_APNS_KEY_ID'], 'PROTOBASE_APNS_KEY and PROTOBASE_APNS_KEY_ID must be set'],
    [['PROTOBASE_APNS_KEY_ID', 'PROTOBASE_APNS_TEAM_ID'], 'PROTOBASE_APNS_KEY_ID and PROTOBASE_APNS_TEAM_ID must be set'],
  ])('stops when %j is missing, naming it and no value', (missing, message) => {
    const env: Record<string, string> = { ...full }
    for (const name of missing) delete env[name]
    const error = failure(env)
    expect(error.message).toContain(message)
    expect(namesNoValue(error)).toBe(true)
  })

  it.each([
    ['garbage', 'not a key'],
    ['a broken PEM', '-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----'],
    ['an RSA key', generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()],
    ['a P-384 key', generateKeyPairSync('ec', { namedCurve: 'P-384' }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()],
    ['a public key', generateKeyPairSync('ec', { namedCurve: 'P-256' }).publicKey.export({ type: 'spki', format: 'pem' }).toString()],
  ])('stops on %s as the key, naming the variable only', (_, key) => {
    const error = failure({ ...full, PROTOBASE_APNS_KEY: key })
    expect(error.message).toMatch(/^PROTOBASE_APNS_KEY is not an APNs key/)
    expect(error.message).toContain('on one line')
    expect(error.message).not.toContain(key.split('\n')[1] ?? key)
  })

  it.each([['PROTOBASE_APNS_KEY_ID'], ['PROTOBASE_APNS_TEAM_ID']])('stops on a %s that is not ten letters and digits', (name) => {
    for (const value of ['abc123defg', 'ABC123', 'ABC123DEFGH', 'ABC/23DEFG']) {
      const error = failure({ ...full, [name]: value })
      expect(error.message).toMatch(new RegExp(`^${name} is not`))
      expect(error.message).not.toContain(value)
    }
  })
})

describe('pemWithLineBreaks', () => {
  const pem = generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()

  it('keeps a PEM with its line breaks, and rebuilds one that lost them', () => {
    expect(pemWithLineBreaks(pem)).toBe(pem)
    expect(pemWithLineBreaks(pem.replace(/\n/g, ' '))).toBe(pem)
    expect(pemWithLineBreaks(pem.replace(/\n/g, ''))).toBe(pem)
  })

  it('keeps text that is no PEM, or whose END line does not match its BEGIN line', () => {
    expect(pemWithLineBreaks('not a key')).toBe('not a key')
    const mismatched = '-----BEGIN PRIVATE KEY----- AAAA -----END PUBLIC KEY-----'
    expect(pemWithLineBreaks(mismatched)).toBe(mismatched)
  })
})
