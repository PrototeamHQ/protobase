import { exportJWK, generateKeyPair, SignJWT, createLocalJWKSet, type JWTPayload } from 'jose'
import { describe, expect, it } from 'vitest'
import { signInTokenAlgorithms, signInTokenProblem, verifySignInToken } from './sign-in-token'

const now = Date.UTC(2026, 10, 16, 12, 0, 0)
const seconds = now / 1000
const clientId = 'app.example.com'
const issuer = 'https://id.example.com'
const valid: JWTPayload = { iss: issuer, sub: 'person-7', aud: clientId, jti: 'token-1', email: 'sanne@example.com', iat: seconds - 10, exp: seconds + 290 }

describe('signInTokenProblem', () => {
  it('takes a token for this app alone, with a jti and an address, that lives at most five minutes', () => {
    expect(signInTokenProblem(valid, clientId, now)).toBeUndefined()
    expect(signInTokenProblem({ ...valid, aud: [clientId] }, clientId, now)).toBeUndefined()
    expect(signInTokenProblem({ ...valid, iat: seconds + 20 }, clientId, now)).toBeUndefined()
  })

  it('refuses another audience, or this app among others', () => {
    expect(signInTokenProblem({ ...valid, aud: 'other.example.com' }, clientId, now)).toMatch(/audience/)
    expect(signInTokenProblem({ ...valid, aud: [clientId, 'other.example.com'] }, clientId, now)).toMatch(/audience/)
  })

  it('refuses a token without a jti or an address', () => {
    expect(signInTokenProblem({ ...valid, jti: undefined }, clientId, now)).toMatch(/jti/)
    expect(signInTokenProblem({ ...valid, jti: '' }, clientId, now)).toMatch(/jti/)
    expect(signInTokenProblem({ ...valid, email: undefined }, clientId, now)).toMatch(/email/)
  })

  it('refuses a token issued in the future, or made to live longer than five minutes', () => {
    expect(signInTokenProblem({ ...valid, iat: seconds + 31 }, clientId, now)).toMatch(/future/)
    expect(signInTokenProblem({ ...valid, exp: valid.iat! + 301 }, clientId, now)).toMatch(/longer/)
  })
})

describe('signInTokenAlgorithms', () => {
  it("keeps the asymmetric algorithms of the provider's discovery, or all of them when it names none", () => {
    expect(signInTokenAlgorithms(['RS256', 'HS256', 'none', 'EdDSA'])).toEqual(['RS256', 'EdDSA'])
    expect(signInTokenAlgorithms(['HS256'])).toEqual([])
    expect(signInTokenAlgorithms(undefined)).toContain('ES256')
  })
})

describe('verifySignInToken', () => {
  const keys = async () => {
    const { privateKey, publicKey } = await generateKeyPair('EdDSA')
    const jwks = createLocalJWKSet({ keys: [{ ...(await exportJWK(publicKey)), alg: 'EdDSA', kid: 'k' }] })
    const sign = (claims: JWTPayload) => new SignJWT(claims).setProtectedHeader({ alg: 'EdDSA', kid: 'k' }).sign(privateKey)
    return { sign, verification: { jwks, issuer, audience: clientId, algorithms: ['EdDSA'] } }
  }

  it("answers the claims of a token the provider's key signed for this app", async () => {
    const { sign, verification } = await keys()
    expect(await verifySignInToken(await sign(valid), verification, clientId, now)).toMatchObject({ sub: 'person-7', jti: 'token-1' })
  })

  it('refuses one from another issuer, expired, issued over five minutes ago, or not a sign-in token', async () => {
    const { sign, verification } = await keys()
    expect(await verifySignInToken(await sign({ ...valid, iss: 'https://other.example.com' }), verification, clientId, now)).toBeUndefined()
    expect(await verifySignInToken(await sign({ ...valid, exp: seconds - 31 }), verification, clientId, now)).toBeUndefined()
    expect(await verifySignInToken(await sign({ ...valid, iat: seconds - 400, exp: seconds + 100 }), verification, clientId, now)).toBeUndefined()
    expect(await verifySignInToken(await sign({ ...valid, jti: undefined }), verification, clientId, now)).toBeUndefined()
    expect(await verifySignInToken('not a token', verification, clientId, now)).toBeUndefined()
  })

  it('refuses one signed with another key, or with an algorithm the discovery does not name', async () => {
    const { verification } = await keys()
    const other = await keys()
    expect(await verifySignInToken(await other.sign(valid), verification, clientId, now)).toBeUndefined()
    const { sign } = await keys()
    expect(await verifySignInToken(await sign(valid), { ...verification, algorithms: ['RS256'] }, clientId, now)).toBeUndefined()
  })
})
