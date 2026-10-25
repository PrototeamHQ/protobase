import { base64url, calculateJwkThumbprint, exportJWK, generateKeyPair, SignJWT, type JWK } from 'jose'
import { describe, expect, it } from 'vitest'
import { betterAuthAuthenticator } from './authenticator'
import type { Authenticator } from '../types'
import type { AdminAuth } from './create-auth'
import { fakeAdapter } from './testing/fake-adapter'

const issuer = 'https://admin.example.com'
const resource = `${issuer}/api/mcp`

const appKeys = await generateKeyPair('EdDSA')
const appJwk = { ...(await exportJWK(appKeys.publicKey)), alg: 'EdDSA', kid: 'app' }
const otherKeys = await generateKeyPair('EdDSA')

// The part of a Better Auth instance the authenticator reads: its keys, the store DPoP proofs are reserved in, and
// the store of grants, where Ana, who holds sales, allows the assistant.
const reserved = new Set<string>()
const authOver = (adapter: unknown) =>
  ({
    issuer,
    api: { getJwks: async () => ({ keys: [appJwk] }) },
    $context: Promise.resolve({
      adapter,
      internalAdapter: {
        reserveVerificationValue: async ({ identifier }: { identifier: string }) => (reserved.has(identifier) ? false : (reserved.add(identifier), true)),
      },
    }),
  }) as unknown as AdminAuth
const allowedAt = new Date(Date.now() - 60_000)
const ana = { id: 'ana', role: 'sales', banned: false, banExpires: null }
const consent = (clientId = 'assistant') => ({ id: `c-${clientId}`, userId: 'ana', clientId, createdAt: allowedAt })
const grants = fakeAdapter({ oauthConsent: [consent()], user: [ana] })

const authenticator = betterAuthAuthenticator({ auth: authOver(grants.adapter) })
const mcp = authenticator.forAudience(resource)

type TokenInput = { aud?: string; typ?: string; cnf?: { jkt: string }; key?: CryptoKey; client?: string; claims?: Record<string, unknown>; exp?: string | number }
const token = ({ aud = resource, typ = 'at+jwt', cnf, key = appKeys.privateKey, client = 'assistant', claims = {}, exp = '5m' }: TokenInput = {}) =>
  new SignJWT({ role: 'sales', client_id: client, azp: client, scope: 'mcp offline_access', ...(cnf && { cnf }), ...claims })
    .setProtectedHeader({ alg: 'EdDSA', kid: 'app', typ })
    .setSubject('ana')
    .setIssuer(issuer)
    .setAudience(aud)
    .setIssuedAt()
    .setExpirationTime(exp)
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

describe("an MCP token's grant", () => {
  it('is read on every request: a token of a client the person no longer allows is refused at once', async () => {
    const store = fakeAdapter({ oauthConsent: [consent(), consent('editor')], user: [ana] })
    const verify = betterAuthAuthenticator({ auth: authOver(store.adapter) }).forAudience(resource)
    const assistant = await token()
    const editor = await token({ client: 'editor' })
    expect(await verify(request(`Bearer ${assistant}`))).toMatchObject({ client: { id: 'assistant' } })
    store.tables.oauthConsent = store.tables.oauthConsent!.filter((row) => row.clientId !== 'assistant')
    await refused(verify, request(`Bearer ${assistant}`))
    expect(await verify(request(`Bearer ${editor}`))).toMatchObject({ client: { id: 'editor' } })
  })

  it('stays refused when the person allows the client again, and takes the tokens issued after', async () => {
    const store = fakeAdapter({ oauthConsent: [consent()], user: [ana] })
    const verify = betterAuthAuthenticator({ auth: authOver(store.adapter) }).forAudience(resource)
    const before = await token()
    store.tables.oauthConsent = [{ id: 'c2', userId: 'ana', clientId: 'assistant', createdAt: new Date(Date.now() + 60_000) }]
    await refused(verify, request(`Bearer ${before}`))
    // Dated in whole seconds, as the provider dates a consent by the clock it stamps `iat` with.
    store.tables.oauthConsent = [{ id: 'c2', userId: 'ana', clientId: 'assistant', createdAt: new Date(Math.floor(Date.now() / 1000) * 1000) }]
    expect(await verify(request(`Bearer ${await token()}`))).toMatchObject({ client: { id: 'assistant' } })
  })

  it('refuses the request when the store cannot be read, never answering on the claims alone', async () => {
    const failing = { findMany: async () => { throw new Error('connection lost') } }
    const verify = betterAuthAuthenticator({ auth: authOver(failing) }).forAudience(resource)
    await expect(Promise.resolve().then(async () => verify(request(`Bearer ${await token()}`)))).rejects.toThrow('connection lost')
  })
})

// Ana's store as a test changes it, with every lookup counted; and the MCP authenticator over it.
const standingOf = (tables: Record<string, Record<string, unknown>[]>, organizations = false) => {
  const store = fakeAdapter({ oauthConsent: [consent(), consent('editor')], user: [{ ...ana }], ...tables })
  const lookups: string[] = []
  const counted = {
    findOne: async (query: { model: string }) => (lookups.push(query.model), store.adapter.findOne(query as never)),
    findMany: async (query: { model: string }) => (lookups.push(query.model), store.adapter.findMany(query as never)),
  }
  const verify = betterAuthAuthenticator({ auth: authOver(counted), organizations }).forAudience(resource)
  return { store, lookups, verify, user: () => store.tables.user![0]! }
}

describe("an MCP token's user", () => {
  it('is read on every request: a lowered role ends the tokens of every client the person allowed, at once', async () => {
    const { verify, user } = standingOf({})
    const assistant = await token()
    const editor = await token({ client: 'editor' })
    expect(await verify(request(`Bearer ${assistant}`))).toMatchObject({ user: { id: 'ana', roles: ['sales'] } })
    user().role = 'accountant'
    await refused(verify, request(`Bearer ${assistant}`))
    await refused(verify, request(`Bearer ${editor}`))
  })

  it('ends with a ban, permanent or not yet run out, and stands again once it runs out', async () => {
    const { verify, user } = standingOf({})
    const bearer = `Bearer ${await token()}`
    Object.assign(user(), { banned: true, banExpires: null })
    await refused(verify, request(bearer))
    Object.assign(user(), { banExpires: new Date(Date.now() + 3_600_000) })
    await refused(verify, request(bearer))
    Object.assign(user(), { banExpires: new Date(Date.now() - 1_000) })
    expect(await verify(request(bearer))).toMatchObject({ user: { id: 'ana' } })
  })

  it('ends when the user is deleted', async () => {
    const { verify, store } = standingOf({})
    store.tables.user = []
    await refused(verify, request(`Bearer ${await token()}`))
  })

  it('must hold each role the token claims by its exact name, in either form of the claim', async () => {
    const { verify, user } = standingOf({})
    const both = `Bearer ${await token({ claims: { role: 'admin,viewer' } })}`
    user().role = 'viewer'
    await refused(verify, request(both))
    user().role = 'admin-readonly,viewer'
    await refused(verify, request(both))
    user().role = 'sales'
    await refused(verify, request(`Bearer ${await token({ claims: { role: ['sales', 'admin'] } })}`))
  })

  it('keeps only the roles the token claims when the user gains one', async () => {
    const { verify, user } = standingOf({})
    user().role = 'admin,sales'
    expect(await verify(request(`Bearer ${await token()}`))).toMatchObject({ user: { roles: ['sales'] } })
  })

  it("outlives the browser session that allowed the client, which the token's sid names", async () => {
    const { verify, lookups } = standingOf({ session: [] })
    expect(await verify(request(`Bearer ${await token({ claims: { sid: 'signed-out' } })}`))).toMatchObject({ user: { id: 'ana' } })
    expect(lookups).not.toContain('session')
  })

  it('reads no store for a token refused on its signature, audience or expiry', async () => {
    const { verify, lookups } = standingOf({})
    await refused(verify, request(`Bearer ${await token({ key: otherKeys.privateKey })}`))
    await refused(verify, request(`Bearer ${await token({ aud: `${issuer}/api/other` })}`))
    await refused(verify, request(`Bearer ${await token({ exp: Math.floor(Date.now() / 1000) - 60 })}`))
    expect(lookups).toEqual([])
  })

  it('is refused when its user or membership cannot be read, never answered on the claims alone', async () => {
    const lost = async () => { throw new Error('connection lost') }
    for (const lookup of ['user', 'member']) {
      const { store } = standingOf({ member: [{ id: 'm1', organizationId: '1', userId: 'ana', role: 'member', appRoles: [] }] }, true)
      const failing = { findMany: store.adapter.findMany, findOne: async (query: { model: string }) => (query.model === lookup ? lost() : store.adapter.findOne(query as never)) }
      const verify = betterAuthAuthenticator({ auth: authOver(failing), organizations: true }).forAudience(resource)
      await expect(Promise.resolve().then(async () => verify(request(`Bearer ${await token({ claims: { org: '1' } })}`)))).rejects.toThrow('connection lost')
    }
  })
})

describe("an MCP token's organization", () => {
  const member = { id: 'm1', organizationId: '1', userId: 'ana', role: 'member', appRoles: ['editor'] }
  const inOne = () => token({ claims: { role: 'user', org: '1', app_roles: ['editor'] } })
  const tables = () => ({ user: [{ ...ana, role: 'user' }], member: [{ ...member }, { ...member, id: 'm2', organizationId: '2' }], organization: [{ id: '1' }, { id: '2' }] })

  it("stands while the membership of the token's own organization holds its roles", async () => {
    const { verify } = standingOf(tables(), true)
    expect(await verify(request(`Bearer ${await inOne()}`))).toMatchObject({ user: { roles: ['editor'] }, organization: { id: '1' } })
  })

  it('ends when the role is lowered there, even while another organization still gives it, whatever the request names', async () => {
    const { verify, store } = standingOf(tables(), true)
    store.tables.member![0]!.appRoles = []
    const bearer = `Bearer ${await inOne()}`
    await refused(verify, request(bearer))
    await refused(verify, new Request(`${resource}?org=2`, { method: 'POST', headers: { authorization: bearer, 'x-organization-id': '2' } }))
  })

  it('ends when the member is removed, or the organization deleted', async () => {
    const removed = standingOf(tables(), true)
    removed.store.tables.member = removed.store.tables.member!.filter((row) => row.organizationId !== '1')
    await refused(removed.verify, request(`Bearer ${await inOne()}`))
    const deleted = standingOf({ ...tables(), member: [], organization: [{ id: '2' }] }, true)
    await refused(deleted.verify, request(`Bearer ${await token({ claims: { role: 'user', org: '1' } })}`))
  })
})

describe('the memberships of a session', () => {
  const tables = () => ({ user: [{ ...ana, role: 'user' }], member: [{ id: 'm1', organizationId: '1', userId: 'ana', role: 'member', appRoles: ['sales'] }, { id: 'm2', organizationId: '2', userId: 'ana', role: 'member', appRoles: ['sales'] }], organization: [{ id: '1' }, { id: '2' }] })

  it("are read from the store for the app's own token, once a list asks, and once per request", async () => {
    const store = fakeAdapter(tables())
    const lookups: string[] = []
    const counted = { findOne: async (query: { model: string }) => (lookups.push(query.model), store.adapter.findOne(query as never)), findMany: async (query: { model: string }) => (lookups.push(query.model), store.adapter.findMany(query as never)) }
    const own = betterAuthAuthenticator({ auth: authOver(counted), organizations: true })
    const appToken = await token({ aud: issuer, typ: 'JWT', claims: { role: 'user', org: '1', app_roles: ['sales'] } })
    const session = await own(request(`Bearer ${appToken}`))
    const read = lookups.length
    expect(await session.memberships!()).toEqual([{ tenant: '1', roles: ['sales'] }, { tenant: '2', roles: ['sales'] }])
    await session.memberships!()
    expect(lookups.slice(read)).toEqual(['user', 'member'])
  })

  it("are not given to an outside app's token, which works in its own organization alone", async () => {
    const { verify } = standingOf(tables(), true)
    const session = await verify(request(`Bearer ${await token({ claims: { role: 'user', org: '1', app_roles: ['sales'] } })}`))
    expect(session).not.toHaveProperty('memberships')
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
