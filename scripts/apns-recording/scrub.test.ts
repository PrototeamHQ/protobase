import { generateKeyPairSync } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { findLeak, keptRequestHeaders, secretsOf } from './scrub'

const pem = generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
const env = { PROTOBASE_APNS_KEY: pem, PROTOBASE_APNS_KEY_ID: 'ABC123DEFG', PROTOBASE_APNS_TEAM_ID: 'TEAM123456' }
const secrets = secretsOf(env, Object.keys(env))

describe('findLeak', () => {
  it('passes a recording of paths, APNs headers and reasons', () => {
    const clean = JSON.stringify({ request: { headers: { ':path': `/3/device/${'0'.repeat(64)}`, 'apns-topic': 'net.example.app' } }, response: { status: 403, body: '{"reason":"InvalidProviderToken"}' } })
    expect(findLeak(clean, secrets)).toBeUndefined()
  })

  it.each([
    ['a JWT', 'eyJhbGciOiJFUzI1NiJ9.eyJpc3MiOiJ4In0.c2ln'],
    ['a PEM key', pem],
    ['a bearer token', 'Bearer x'],
    ['a base64 run as long as a key', pem.split('\n')[1]!.slice(0, 44)],
    ['a device token', `/3/device/${'ab12'.repeat(16)}`],
  ])('finds %s', (kind, text) => {
    expect(findLeak(JSON.stringify({ text }), [])).toBe(kind)
  })

  it('finds the key id, the team id and each line of the key, naming no value', () => {
    for (const secret of ['ABC123DEFG', 'TEAM123456', pem.split('\n')[2]!]) expect(findLeak(`x ${secret} x`, secrets)).toBe('a secret value')
  })
})

describe('keptRequestHeaders', () => {
  it('never keeps the provider token', () => {
    expect(keptRequestHeaders.has('authorization')).toBe(false)
  })
})
