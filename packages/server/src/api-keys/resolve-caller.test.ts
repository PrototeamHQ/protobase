import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose'
import { beforeAll, describe, expect, it } from 'vitest'
import { jwtVerifier } from '../auth/jwt'
import { HttpProblem } from '../problem'
import { apiKeyCaller } from './resolve-caller'

const publishable = 'sb_publishable_abc'
const secret = 'sb_secret_xyz'
const issuer = 'https://app.example.com'

let sign: (alg: 'ES256' | 'EdDSA', claims: Record<string, unknown>) => Promise<string>
let caller: ReturnType<typeof apiKeyCaller>

beforeAll(async () => {
  const pairs = { ES256: await generateKeyPair('ES256'), EdDSA: await generateKeyPair('EdDSA') }
  const keys = await Promise.all(Object.entries(pairs).map(async ([alg, pair]) => ({ ...(await exportJWK(pair.publicKey)), alg, kid: alg })))
  sign = (alg, claims) => new SignJWT(claims).setProtectedHeader({ alg, kid: alg }).setIssuer(issuer).setAudience(issuer).setExpirationTime('5m').sign(pairs[alg].privateKey)
  caller = apiKeyCaller({ keys: { publishable, secret }, verify: jwtVerifier({ keys: createLocalJWKSet({ keys }), issuer, audience: issuer }) })
})

const request = (headers: Record<string, string>) => new Request('https://app.example.com/api/sb/rest/v1/tasks', { headers })

const refusal = async (headers: Record<string, string>) => {
  const error = await caller(request(headers)).catch((thrown: unknown) => thrown)
  expect(error).toBeInstanceOf(HttpProblem)
  return (error as HttpProblem).status
}

describe('apiKeyCaller', () => {
  it('makes the publishable key anon, alone or as its own bearer, as supabase-js sends it', async () => {
    const anon = { role: 'anon', claims: { role: 'anon' } }
    expect(await caller(request({ apikey: publishable }))).toEqual(anon)
    expect(await caller(request({ apikey: publishable, authorization: `Bearer ${publishable}` }))).toEqual(anon)
  })

  it('makes the publishable key with a user\'s ES256 or EdDSA token authenticated, with its claims', async () => {
    for (const alg of ['ES256', 'EdDSA'] as const) {
      const resolved = await caller(request({ apikey: publishable, authorization: `Bearer ${await sign(alg, { sub: 'user-1', email: 'a@example.com' })}` }))
      expect(resolved).toMatchObject({ role: 'authenticated', claims: { sub: 'user-1', email: 'a@example.com', iss: issuer } })
    }
  })

  it('makes the secret key the app\'s role, and a user\'s token beside it authenticated', async () => {
    const app = { role: 'app', claims: { role: 'service_role' } }
    expect(await caller(request({ apikey: secret }))).toEqual(app)
    expect(await caller(request({ apikey: secret, authorization: `Bearer ${secret}` }))).toEqual(app)
    expect(await caller(request({ apikey: secret, authorization: `Bearer ${await sign('ES256', { sub: 'user-1' })}` }))).toMatchObject({ role: 'authenticated', claims: { sub: 'user-1' } })
  })

  it('refuses a missing or wrong key with 401', async () => {
    expect(await refusal({})).toBe(401)
    expect(await refusal({ authorization: `Bearer ${secret}` })).toBe(401)
    expect(await refusal({ apikey: 'sb_publishable_other' })).toBe(401)
  })

  it('refuses a bearer that is another key, no bearer, or a token that does not verify or names no user, with 401', async () => {
    expect(await refusal({ apikey: publishable, authorization: `Bearer ${secret}` })).toBe(401)
    expect(await refusal({ apikey: publishable, authorization: publishable })).toBe(401)
    expect(await refusal({ apikey: publishable, authorization: 'Bearer a.b.c' })).toBe(401)
    expect(await refusal({ apikey: publishable, authorization: `Bearer ${await sign('ES256', { email: 'a@example.com' })}` })).toBe(401)
  })

  it('admits nothing by key when the app has none', async () => {
    const keyless = apiKeyCaller({ keys: {}, verify: () => Promise.reject(new Error('never called')) })
    await expect(keyless(request({ apikey: publishable }))).rejects.toMatchObject({ status: 401 })
  })
})
