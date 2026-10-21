import { base64url, calculateJwkThumbprint, exportJWK, generateKeyPair, SignJWT, type JWK } from 'jose'
import { describe, expect, it } from 'vitest'
import { betterAuthAuthenticator } from './authenticator'
import type { Authenticator } from '../types'
import type { AdminAuth } from './create-auth'

const issuer = 'https://admin.example.com'
const resource = `${issuer}/api/mcp`

const appKeys = await generateKeyPair('EdDSA')
const appJwk = { ...(await exportJWK(appKeys.publicKey)), alg: 'EdDSA', kid: 'app' }
const otherKeys = await generateKeyPair('EdDSA')

// The part of a Better Auth instance the authenticator reads: its keys, and the store DPoP proofs are reserved in.
const reserved = new Set<string>()
const auth = {
  issuer,
  api: { getJwks: async () => ({ keys: [appJwk] }) },
  $context: Promise.resolve({
    internalAdapter: {
      reserveVerificationValue: async ({ identifier }: { identifier: string }) => (reserved.has(identifier) ? false : (reserved.add(identifier), true)),
    },
  }),
} as unknown as AdminAuth

const authenticator = betterAuthAuthenticator({ auth })
const mcp = authenticator.forAudience(resource)

type TokenInput = { aud?: string; typ?: string; cnf?: { jkt: string }; key?: CryptoKey }
const token = ({ aud = resource, typ = 'at+jwt', cnf, key = appKeys.privateKey }: TokenInput = {}) =>
  new SignJWT({ role: 'sales', client_id: 'assistant', azp: 'assistant', scope: 'mcp offline_access', ...(cnf && { cnf }) })
    .setProtectedHeader({ alg: 'EdDSA', kid: 'app', typ })
    .setSubject('ana')
    .setIssuer(issuer)
    .setAudience(aud)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(key)

const dpopKeys = await generateKeyPair('ES256')
const dpopJwk = await exportJWK(dpopKeys.publicKey)
const jkt = await calculateJwkThumbprint(dpopJwk)
const strangerKeys = await generateKeyPair('ES256')

const ath = async (accessToken: string) => base64url.encode(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(accessToken))))

const proof = async (accessToken: string, { htu = resource, htm = 'POST', keys = dpopKeys, jwk = dpopJwk }: { htu?: string; htm?: string; keys?: CryptoKeyPair; jwk?: JWK } = {}) =>
  new SignJWT({ htm, htu, jti: crypto.randomUUID(), ath: await ath(accessToken) }).setProtectedHeader({ alg: 'ES256', typ: 'dpop+jwt', jwk }).setIssuedAt().sign(keys.privateKey)

const request = (authorization: string, dpop?: string) =>
  new Request(resource, { method: 'POST', headers: { authorization, ...(dpop && { dpop }) } })

// Whatever an authenticator throws, synchronously or not, as a rejection.
const refused = (authenticate: Authenticator, req: Request) => expect(Promise.resolve().then(() => authenticate(req))).rejects.toMatchObject({ status: 401 })

describe('tokens for another audience', () => {
  it("are taken by forAudience with the client, and refused by the app's own API", async () => {
    const mcpToken = await token()
    expect(await mcp(request(`Bearer ${mcpToken}`))).toEqual({ user: { id: 'ana', roles: ['sales'] }, client: { id: 'assistant', scopes: ['mcp', 'offline_access'] } })
    await refused(authenticator, request(`Bearer ${mcpToken}`))
  })

  it("refuse the app's own tokens, another audience's, a token that is not an access token, and another key's", async () => {
    await refused(mcp, request(`Bearer ${await token({ aud: issuer, typ: 'JWT' })}`))
    await refused(mcp, request(`Bearer ${await token({ aud: `${issuer}/api/other` })}`))
    await refused(mcp, request(`Bearer ${await token({ typ: 'JWT' })}`))
    await refused(mcp, request(`Bearer ${await token({ key: otherKeys.privateKey })}`))
  })
})

describe('DPoP-bound tokens', () => {
  it('are refused as a bearer token', async () => {
    await refused(mcp, request(`Bearer ${await token({ cnf: { jkt } })}`))
  })

  it('are taken with a fresh proof from their key, each proof once', async () => {
    const bound = await token({ cnf: { jkt } })
    const once = await proof(bound)
    expect(await mcp(request(`DPoP ${bound}`, once))).toMatchObject({ user: { id: 'ana' } })
    await refused(mcp, request(`DPoP ${bound}`, once))
  })

  it('are refused without a proof, with another key, or with one made for another URL or method', async () => {
    const bound = await token({ cnf: { jkt } })
    await refused(mcp, request(`DPoP ${bound}`))
    await refused(mcp, request(`DPoP ${bound}`, await proof(bound, { keys: strangerKeys, jwk: await exportJWK(strangerKeys.publicKey) })))
    await refused(mcp, request(`DPoP ${bound}`, await proof(bound, { htu: `${issuer}/api/v1/companies` })))
    await refused(mcp, request(`DPoP ${bound}`, await proof(bound, { htm: 'GET' })))
  })

  it('cannot pass an unbound token off as bound', async () => {
    const unbound = await token()
    await refused(mcp, request(`DPoP ${unbound}`, await proof(unbound)))
  })
})
