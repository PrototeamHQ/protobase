import { describe, expect, it } from 'vitest'
import { HttpProblem } from '../../problem'
import { bearerMatches, hookKey, hookMode, hookSecret, sha256, usableSecret } from './hook-secrets'

describe('webhook secrets', () => {
  it('reads the mode, standard_webhooks by default, and no mode for one it does not know', () => {
    expect(hookMode({})).toBe('standard_webhooks')
    expect(hookMode({ auth: { mode: 'bearer' } })).toBe('bearer')
    expect(hookMode({ auth: { mode: 'url_only' } })).toBeUndefined()
    expect(hookMode({ auth: {} })).toBeUndefined()
  })

  it('makes a secret for its mode, or checks the one given', () => {
    expect(hookSecret('standard_webhooks', undefined)).toMatch(/^whsec_[A-Za-z0-9+/]{43}=$/)
    expect(hookSecret('hmac', undefined)).toMatch(/^[\w-]{43}$/)
    const given = `whsec_${Buffer.alloc(24, 7).toString('base64')}`
    expect(hookSecret('standard_webhooks', given)).toBe(given)
    expect(() => hookSecret('standard_webhooks', 'whsec_c2hvcnQ=')).toThrow(HttpProblem)
    // 25 bytes' worth of base64 without its padding, which the signature check cannot decode.
    expect(() => hookSecret('standard_webhooks', `whsec_${'A'.repeat(34)}`)).toThrow(HttpProblem)
    expect(usableSecret('standard_webhooks', `whsec_${'A'.repeat(34)}`)).toBe(false)
    expect(() => hookSecret('bearer', 'short')).toThrow(HttpProblem)
    expect(usableSecret('standard_webhooks', 'not whsec')).toBe(false)
    expect(usableSecret('hmac', null)).toBe(false)
  })

  it('makes keys of 32 random bytes', () => {
    expect(hookKey()).toMatch(/^[\w-]{43}$/)
    expect(hookKey()).not.toBe(hookKey())
  })

  it('matches a bearer token by its SHA-256, refusing any other length without throwing', () => {
    const hash = sha256('the right token of thirty-two characters')
    expect(bearerMatches('the right token of thirty-two characters', hash)).toBe(true)
    expect(bearerMatches('x', hash)).toBe(false)
    expect(bearerMatches('x'.repeat(10_000), hash)).toBe(false)
    expect(bearerMatches('x', 'abc')).toBe(false)
  })
})
