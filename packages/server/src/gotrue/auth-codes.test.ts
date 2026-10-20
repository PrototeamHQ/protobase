import { describe, expect, it } from 'vitest'
import { matchesChallenge } from './auth-codes'

describe('a PKCE verifier', () => {
  // RFC 7636, appendix B.
  const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'

  it('matches the S256 challenge made from it, and no other', async () => {
    expect(await matchesChallenge(verifier, { challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM', method: 's256' })).toBe(true)
    expect(await matchesChallenge(`${verifier}x`, { challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM', method: 's256' })).toBe(false)
  })

  it('matches a plain challenge that is itself', async () => {
    expect(await matchesChallenge(verifier, { challenge: verifier, method: 'plain' })).toBe(true)
    expect(await matchesChallenge(verifier, { challenge: 'other', method: 'plain' })).toBe(false)
  })
})
