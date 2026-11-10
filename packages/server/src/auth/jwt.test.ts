import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose'
import { describe, expect, it } from 'vitest'
import { jwtAuthenticator } from './jwt'

const { publicKey, privateKey } = await generateKeyPair('EdDSA')
const authenticate = jwtAuthenticator({ keys: createLocalJWKSet({ keys: [{ ...(await exportJWK(publicKey)), alg: 'EdDSA', kid: 'k1' }] }) })
const sign = (claims: Record<string, unknown>) => new SignJWT(claims).setProtectedHeader({ alg: 'EdDSA', kid: 'k1' }).setSubject('u1').setExpirationTime('5m').sign(privateKey)
const request = (token: string) => new Request('https://app.example.com/api/v1/companies', { headers: { authorization: `Bearer ${token}` } })

describe('jwtAuthenticator without DPoP', () => {
  it('takes a bearer token', async () => {
    expect(await authenticate(request(await sign({})))).toEqual({ user: { id: 'u1', roles: [] } })
  })

  it('refuses a token bound to a key, which only a proof of that key may use', async () => {
    await expect(authenticate(request(await sign({ cnf: { jkt: 'thumbprint' } })))).rejects.toMatchObject({ status: 401 })
  })
})
