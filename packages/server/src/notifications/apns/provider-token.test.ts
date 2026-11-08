import { createPublicKey, verify } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { apnsTestEnv } from '../testing/apns-service'
import { readApnsSettings } from './apns-settings'
import { providerToken } from './provider-token'

const settings = readApnsSettings(apnsTestEnv())!
const decoded = (part: string) => JSON.parse(Buffer.from(part, 'base64url').toString())

describe('providerToken', () => {
  it('is an ES256 JWT with the key id and team id, signed by the key', () => {
    const token = providerToken(settings, () => 1_700_000_000_000).token()
    const [header, claims, signature] = token.split('.')
    expect(decoded(header!)).toEqual({ alg: 'ES256', kid: 'ABC123DEFG' })
    expect(decoded(claims!)).toEqual({ iss: 'TEAM123456', iat: 1_700_000_000 })
    const valid = verify('sha256', Buffer.from(`${header}.${claims}`), { key: createPublicKey(settings.key), dsaEncoding: 'ieee-p1363' }, Buffer.from(signature!, 'base64url'))
    expect(valid).toBe(true)
  })

  it('is reused for 50 minutes, then signed again', () => {
    let now = 1_700_000_000_000
    const tokens = providerToken(settings, () => now)
    const first = tokens.token()
    now += 49 * 60_000 + 59_000
    expect(tokens.token()).toBe(first)
    now += 1000
    const second = tokens.token()
    expect(second).not.toBe(first)
    expect(decoded(second.split('.')[1]!).iat).toBe(1_700_000_000 + 50 * 60)
  })

  it('signs a new one after a reset', () => {
    let now = 1_700_000_000_000
    const tokens = providerToken(settings, () => now)
    const first = tokens.token()
    now += 1000
    tokens.reset()
    expect(tokens.token()).not.toBe(first)
  })
})
