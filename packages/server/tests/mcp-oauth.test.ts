import { base64url, calculateJwkThumbprint, decodeJwt, decodeProtectedHeader, importJWK, SignJWT } from 'jose'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { authSchemaMigration, checkAuthSchema } from '../src/better-auth/auth-schema'
import { betterAuthAuthenticator } from '../src/better-auth/authenticator'
import type { CreateAuthOptions } from '../src/better-auth/create-auth'
import { deleteUser, setUserBanned, setUserRole } from '../src/better-auth/users'
import { dropMcpTables } from '../src/better-auth/mcp/mcp-tables'
import { createAdmin } from '../src/create-admin'
import type { MailMessage } from '../src/mail/smtp-mailer'
import { openSnapshotDb, type SnapshotDb } from '../../../test-support/sql-snapshot'
import { authOn, cimdClientId, cookieOf, mcpStores, origin, password, redirectUri, resource, serveMcp, type McpStores, type Tokens } from './support/mcp-app'

// Real scrypt hashing runs on this thread, CPU work a busy machine stretches past 5 s.
vi.setConfig({ testTimeout: 30_000 })

let fixture: McpStores['fixture']
let base: SnapshotDb
let migrated: SnapshotDb
let migration: string
let stores: McpStores

beforeAll(async () => {
  stores = await mcpStores()
  ;({ fixture, base, migrated, migration } = stores)
})
afterAll(async () => { await fixture.db.destroy() })

const serve = (options: Partial<CreateAuthOptions> = {}, existing?: SnapshotDb) => serveMcp(stores, { auth: options, ...(existing && { existing }) })

const recordingMailer = () => {
  const sent: MailMessage[] = []
  const last = async (to: string) => {
    await expect.poll(() => sent.some((message) => message.to === to), { timeout: 10_000 }).toBe(true)
    return sent.findLast((message) => message.to === to)!.text
  }
  return { sent, last, mailer: { send: async (message: MailMessage) => void sent.push(message) } }
}

const resourceRequest = (token: string, scheme = 'Bearer', dpop?: string) =>
  new Request(resource, { method: 'POST', headers: { authorization: `${scheme} ${token}`, ...(dpop && { dpop }) } })

// Whether the MCP endpoint's authenticator takes an access token: its session, or the status it refuses it with.
const mcpTakes = (authenticate: { forAudience: (audience: string) => (request: Request) => unknown }, token: string) =>
  Promise.resolve()
    .then(() => authenticate.forAudience(resource)(resourceRequest(token)))
    .then(() => 'taken', (error: { status?: number }) => error.status)

// Allows the client again, as the person does after a disconnect, dating the new consent a second after the tokens
// issued so far, as it is outside the tests, whose clock stands still.
const reconnect = async (app: Awaited<ReturnType<typeof serve>>, cookie: string, clientId: string) => {
  expect((await app.exchange(clientId, await app.connect(cookie, clientId))).status).toBe(200)
  await app.store.query(`update oauth_consent set created_at = $1 where client_id = $2`, [new Date(Date.now() + 1000), clientId])
}

// A DPoP proof (RFC 9449) for `htu`, and for an access token when given. The provider keeps each proof's hash, so the
// key is fixed and Ed25519, whose signatures, unlike ECDSA's, are the same in the recording and every replay.
const dpopJwk = { kty: 'OKP', crv: 'Ed25519', x: 'zENySdtsCGMof7cw-f0U5aL39dT5cLxNWVb9ndTN1cU' }
const dpopKey = await importJWK({ ...dpopJwk, d: 'h8lLaHGzX6-_iGD2Ve8SYxhm2jhcr1wPpq5RC-bmzQ0' }, 'EdDSA')
let proofs = 0
const dpopProof = async (htu: string, accessToken?: string) => {
  const ath = accessToken && base64url.encode(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(accessToken))))
  return new SignJWT({ htm: 'POST', htu, jti: `proof-${++proofs}`, ...(ath && { ath }) }).setProtectedHeader({ alg: 'EdDSA', typ: 'dpop+jwt', jwk: dpopJwk }).setIssuedAt().sign(dpopKey)
}

describe('the auth schema with MCP', () => {
  it('gets the OAuth tables in snake_case, and the server starts once they exist', async () => {
    expect(migration).toMatch(/create table if not exists "oauth_client"/)
    expect(migration).toMatch(/create table if not exists "oauth_consent" \("id" text not null primary key, "client_id" text not null/)
    await expect(checkAuthSchema(await authOn(await base.clone()))).rejects.toThrow(/missing oauth_client/)
    const auth = await authOn(await migrated.clone())
    await expect(checkAuthSchema(auth)).resolves.toBeUndefined()
  })
})

describe('connecting an MCP client', () => {
  it('registers it, signs the person in, asks on the connect page and gives a token for the MCP resource only', async () => {
    const { grant, authenticate } = await serve()
    const { tokens } = await grant()
    expect(tokens.token_type).toBe('Bearer')
    expect(tokens.scope).toBe('mcp offline_access')
    expect(tokens.refresh_token).toBeTruthy()
    expect(decodeProtectedHeader(tokens.access_token).typ).toBe('at+jwt')
    const claims = decodeJwt(tokens.access_token)
    expect(claims).toMatchObject({ aud: resource, iss: origin, scope: 'mcp offline_access', email: 'ana@example.com', role: 'sales' })
    expect(claims.exp! - claims.iat!).toBe(900)
    const request = (token: string) => new Request(resource, { method: 'POST', headers: { authorization: `Bearer ${token}` } })
    expect(await authenticate.forAudience(resource)(request(tokens.access_token))).toMatchObject({ user: { roles: ['sales'] }, client: { scopes: ['mcp', 'offline_access'] } })
  })
})

describe('the grant', () => {
  it('keeps the role it was allowed with when the client refreshes, whatever the session switches to', async () => {
    const { grant, request, refresh } = await serve()
    const { clientId, cookie, tokens } = await grant()
    expect((await request('/api/auth/role/switch', { cookie, body: { role: 'accountant' } })).status).toBe(200)
    const refreshed = await refresh(clientId, tokens.refresh_token!)
    expect(refreshed.status).toBe(200)
    expect(decodeJwt(((await refreshed.json()) as Tokens).access_token)).toMatchObject({ role: 'sales' })
  })

  it('is refused at refresh once the person no longer holds its role', async () => {
    const { grant, refresh, auth, refused } = await serve()
    const { clientId, tokens } = await grant()
    await setUserRole(auth, { email: 'ana@example.com', role: 'accountant' })
    await refused(await refresh(clientId, tokens.refresh_token!))
  })

  it('freezes the role chosen last when the session never switched', async () => {
    const { grant, store } = await serve()
    await store.query(`update "user" set last_role = 'accountant' where email = 'ana@example.com'`)
    const { tokens } = await grant()
    expect(decodeJwt(tokens.access_token)).toMatchObject({ role: 'accountant' })
  })

  it("gets a refresh token for a client registered with scope mcp alone and no grant types, asking for mcp alone", async () => {
    const { register, signIn, connect, exchange } = await serve()
    const clientId = await register({ scope: 'mcp' })
    const response = await exchange(clientId, await connect(await signIn('ana@example.com'), clientId, { scope: 'mcp' }))
    const tokens = (await response.json()) as Tokens
    expect(tokens.scope).toBe('mcp offline_access')
    expect(tokens.refresh_token).toBeTruthy()
  })

  it('is for the MCP resource when the client names none, at authorize or at the token endpoint', async () => {
    const { grant } = await serve()
    const { tokens } = await grant()
    expect(decodeJwt(tokens.access_token).aud).toBe(resource)
  })

  it('is never for the app itself, in any form of its address, at authorize, the code exchange or refresh', async () => {
    const { register, signIn, authorize, connect, exchange, refresh } = await serve()
    const clientId = await register()
    const cookie = await signIn('ana@example.com')
    const targets = [origin, `${origin}/`, 'HTTP://LOCALHOST:5173', `${origin}/api/v1`]
    for (const target of targets) {
      const { location } = await authorize(cookie, clientId, { resource: target })
      expect(new URL(location, origin).searchParams.get('error'), target).toBe('invalid_target')
    }
    for (const target of targets) {
      const exchanged = await exchange(clientId, await connect(cookie, clientId), {}, { resource: target })
      expect(exchanged.status, target).toBe(400)
      expect(await exchanged.json()).toMatchObject({ error: 'invalid_target' })
    }
    const tokens = (await (await exchange(clientId, await connect(cookie, clientId))).json()) as Tokens
    for (const target of targets) {
      const refreshed = await refresh(clientId, tokens.refresh_token!, {}, { resource: target })
      expect(refreshed.status, target).toBe(400)
      expect(await refreshed.json()).toMatchObject({ error: 'invalid_target' })
    }
  })
})

// The newest sign-in policy row wins; this one requires two-factor authentication of everyone.
const requireTwoFactor = (store: SnapshotDb) =>
  store.query(`insert into sign_in_policy (id, password, email_code, passkey, two_factor, staff_access, platform_sign_in, created_at) values ('mcp-policy', 'allowed', 'allowed', 'allowed', 'required', 'allowed', 'allowed', now() + interval '1 day')`)

describe('who cannot allow a client', () => {
  it('someone without the setup the sign-in policy requires: sent to the connect page, refused there, and refused at refresh', async () => {
    const { grant, store, signIn, register, authorize, resume, answer, refresh, refused, queryOf } = await serve()
    const { clientId: before, tokens } = await grant()
    await requireTwoFactor(store)
    await refused(await refresh(before, tokens.refresh_token!))

    const clientId = await register()
    const cookie = await signIn('ana@example.com')
    const { location } = await authorize(cookie, clientId)
    expect(location).toBe('/-/connect')
    const signed = queryOf((await authorize(undefined, clientId)).location)
    for (const response of [await resume(cookie, signed), await answer(cookie, signed)]) {
      expect(response.status).toBe(403)
      expect(await response.json()).toMatchObject({ code: 'SIGN_IN_SETUP_REQUIRED' })
    }
  })

  it('someone whose address is not verified, now or since the grant', async () => {
    const { grant, store, signIn, register, authorize, resume, answer, refresh, refused, queryOf } = await serve()
    const { clientId: before, tokens } = await grant()
    await store.query(`update "user" set email_verified = false where email = 'ana@example.com'`)
    await refused(await refresh(before, tokens.refresh_token!))

    const clientId = await register()
    const cookie = await signIn('ana@example.com')
    const { location } = await authorize(cookie, clientId)
    expect(location.startsWith('/-/connect?')).toBe(true)
    for (const response of [await resume(cookie, queryOf(location)), await answer(cookie, queryOf(location))]) {
      expect(response.status).toBe(403)
      expect(await response.json()).toMatchObject({ code: 'ADDRESS_NOT_VERIFIED' })
    }
  })

  it('staff signed in as the person, on every OAuth path, even for a client the person allowed', async () => {
    const { grant, store, request, authorize, resume, answer, queryOf } = await serve()
    const { clientId, cookie } = await grant()
    await store.query(`update session set impersonated_by = 'alex@operator.example' where user_id = (select id from "user" where email = 'ana@example.com')`)
    const signed = queryOf((await authorize(undefined, clientId)).location)
    const responses = [
      (await authorize(cookie, clientId)).response,
      (await authorize(cookie, clientId, { prompt: 'none' })).response,
      await resume(cookie, signed),
      await answer(cookie, signed),
      await request(`/api/auth/oauth2/public-client?client_id=${clientId}`, { cookie }),
    ]
    for (const response of responses) {
      expect(response.status).toBe(403)
      expect(response.headers.get('location')).toBeNull()
      expect(await response.json()).toMatchObject({ code: 'STAFF_CANNOT_CONNECT' })
    }
    // Staff may see what the person connected, and not disconnect it.
    expect(((await (await request('/api/auth/account/connected-apps', { cookie })).json()) as { apps: unknown[] }).apps).toHaveLength(1)
    const disconnect = await request('/api/auth/account/connected-apps/disconnect', { cookie, body: { clientId } })
    expect(disconnect.status).toBe(403)
    expect(await disconnect.json()).toMatchObject({ code: 'STAFF_CANNOT_CHANGE_SIGN_IN' })
  })
})

describe('the signed request', () => {
  it('never resumes from a sign-in: the person goes on from the connect page', async () => {
    const { register, authorize, request, queryOf } = await serve()
    const clientId = await register()
    const signed = queryOf((await authorize(undefined, clientId)).location)
    const response = await request('/api/auth/sign-in/email', { body: { email: 'ana@example.com', password, oauth_query: signed } })
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ code: 'OAUTH_QUERY_REFUSED' })
    expect(response.headers.getSetCookie()).toEqual([])
  })

  it('still resumes when the session cookie is refreshed on the way', async () => {
    const { register, signIn, authorize, resume, store, queryOf } = await serve()
    const clientId = await register()
    const cookie = await signIn('ana@example.com')
    // Older than a day, the session is extended, and its cookie set again, by the request that reads it: it expires in
    // 5 days of the 7 a new one gets (the test clock stands at 2026-08-01).
    await store.query(`update session set expires_at = '2026-08-06T00:00:00Z' where user_id = (select id from "user" where email = 'ana@example.com')`)
    const resumed = await resume(cookie, queryOf((await authorize(cookie, clientId)).location))
    expect(resumed.status, await resumed.clone().text()).toBe(200)
    const { rows } = await store.query<{ expires_at: Date }>(`select expires_at from session where user_id = (select id from "user" where email = 'ana@example.com')`)
    expect(rows.map((row) => new Date(row.expires_at).toISOString())).toEqual(['2026-08-08T00:00:00.000Z'])
    expect(((await resumed.json()) as { url: string }).url.startsWith('/-/connect?')).toBe(true)
  })

  it("is another app's only: one signed with another secret is refused", async () => {
    const { register, authorize, queryOf } = await serve()
    const other = await serve({ secret: 'another-secret-another-secret-another-1234' })
    const signed = queryOf((await authorize(undefined, await register())).location)
    const response = await other.resume(await other.signIn('ana@example.com'), signed)
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: 'invalid_signature' })
  })
})

describe('discovery', () => {
  it('answers both documents to anyone, naming the app and its MCP resource whatever host is asked', async () => {
    const { request } = await serve()
    const asked: Record<string, string>[] = [{}, { 'x-forwarded-host': 'evil.example' }, { forwarded: 'host=evil.example' }]
    for (const headers of asked) {
      const server = await request('http://evil.example/.well-known/oauth-authorization-server', { from: 'https://assistant.example', headers })
      expect(server.status).toBe(200)
      expect(server.headers.get('access-control-allow-origin')).toBe('*')
      const metadata = (await server.json()) as Record<string, unknown>
      expect(metadata.issuer).toBe(origin)
      for (const key of ['authorization_endpoint', 'token_endpoint', 'registration_endpoint']) expect(String(metadata[key])).toMatch(/^http:\/\/localhost:5173\/api\/auth\/oauth2\//)
      for (const path of ['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/api/mcp']) {
        const protectedResource = await request(`http://evil.example${path}`, { from: 'https://assistant.example', headers })
        expect(protectedResource.headers.get('access-control-allow-origin')).toBe('*')
        expect(await protectedResource.json()).toMatchObject({ resource, authorization_servers: [origin], scopes_supported: ['mcp'] })
      }
    }
  })

  it('lets clients register and fetch tokens from anywhere, preflight included, and keeps CORS off authorize', async () => {
    const { request, register } = await serve()
    for (const path of ['/api/auth/oauth2/register', '/api/auth/oauth2/token']) {
      const preflight = await request(path, { method: 'OPTIONS', from: 'https://assistant.example', headers: { 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type, dpop' } })
      expect(preflight.status).toBe(204)
      expect(preflight.headers.get('access-control-allow-origin')).toBe('*')
    }
    const registered = await request('/api/auth/oauth2/register', { from: 'https://assistant.example', body: { redirect_uris: [redirectUri], client_name: 'From afar', token_endpoint_auth_method: 'none' } })
    expect(registered.status).toBe(201)
    expect(registered.headers.get('access-control-allow-origin')).toBe('*')
    const authorized = await request(`/api/auth/oauth2/authorize?client_id=${await register()}`, { from: 'https://assistant.example' })
    expect(authorized.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('serves none of it without MCP', async () => {
    const auth = await authOn(await migrated.clone(), { mcp: undefined })
    const app = createAdmin({ resources: [], db: fixture.db, authenticate: betterAuthAuthenticator({ auth }), auth })
    expect((await app.request(`${origin}/.well-known/oauth-authorization-server`)).status).toBe(404)
    expect((await app.request(`${origin}/api/auth/oauth2/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status).toBe(404)
    expect(auth.mcp).toBeUndefined()
  })
})

describe('registration', () => {
  it('refuses back-channel logout and a key set to fetch', async () => {
    const { request } = await serve()
    for (const extra of [{ backchannel_logout_uri: 'https://client.example.com/logout' }, { jwks_uri: `${origin}/jwks.json`, token_endpoint_auth_method: 'private_key_jwt' }]) {
      const response = await request('/api/auth/oauth2/register', { from: null, body: { redirect_uris: [redirectUri], client_name: 'Test', ...extra } })
      expect(response.status).toBe(400)
      expect(await response.json()).toMatchObject({ error: 'invalid_client_metadata' })
    }
  })

  it('chooses the client id itself, so a client cannot pass for a published one', async () => {
    const { register } = await serve()
    expect(await register({ client_id: 'https://assistant.example/oauth/client.json' })).not.toBe('https://assistant.example/oauth/client.json')
  })

  it('needs none for a client that publishes its metadata at its id', async () => {
    const { signIn, connect, exchange } = await serve()
    const response = await exchange(cimdClientId, await connect(await signIn('ana@example.com'), cimdClientId))
    expect(response.status, await response.clone().text()).toBe(200)
  })

  it('never fetches the metadata of a client whose id names a private address', async () => {
    const { signIn, authorize, request } = await serve({ mcp: true })
    const cookie = await signIn('ana@example.com')
    for (const host of ['127.0.0.1', '10.0.0.1', '169.254.169.254', '[::1]']) {
      const clientId = `https://${host}/client.json`
      const { location, response } = await authorize(cookie, clientId)
      expect(location.startsWith('/-/connect'), host).toBe(false)
      expect(response.status === 302 ? new URL(location, origin).searchParams.has('code') : false).toBe(false)
      expect((await request(`/api/auth/oauth2/public-client?client_id=${encodeURIComponent(clientId)}`, { cookie })).status, host).not.toBe(200)
    }
  })
})

describe('the endpoints MCP does not use', () => {
  it('are closed, however the path is written', async () => {
    const { request, signIn } = await serve()
    const cookie = await signIn('ana@example.com')
    const paths = [
      ['POST', '/api/auth/oauth2/create-client'],
      ['GET', '/api/auth/oauth2/userinfo'],
      ['GET', '/api/auth/oauth2/get-consents'],
      ['POST', '/api/auth/oauth2/delete-consent'],
    ] as const
    for (const [method, path] of paths) {
      for (const variant of [path, `${path}/`, path.replace('/oauth2/', '//oauth2/'), path.replace('/oauth2/', '/oauth2%2F'), path.toUpperCase()]) {
        const response = await request(variant, { cookie, method, ...(method === 'POST' && { body: { client_name: 'x', redirect_uris: [redirectUri], client_id: 'x' } }) })
        expect([403, 404], `${method} ${variant}`).toContain(response.status)
      }
    }
  })
})

describe('audiences', () => {
  it("keeps MCP tokens out of the app's API, and the app's tokens out of MCP", async () => {
    const { grant, request, authenticate } = await serve()
    const { cookie, tokens } = await grant()
    expect((await request('/api/v1/companies', { headers: { authorization: `Bearer ${tokens.access_token}` } })).status).toBe(401)
    const own = ((await (await request('/api/auth/token', { cookie })).json()) as { token: string }).token
    // Taken, if not allowed to read companies as sales.
    expect((await request('/api/v1/companies?page_size=1', { headers: { authorization: `Bearer ${own}` } })).status).toBe(403)
    await expect(Promise.resolve().then(() => authenticate.forAudience(resource)(resourceRequest(own)))).rejects.toMatchObject({ status: 401 })
  })

  it("gives an MCP token no session on the app's own endpoints, as Bearer or DPoP", async () => {
    const { grant, request } = await serve()
    const { clientId, tokens } = await grant()
    for (const scheme of ['Bearer', 'DPoP']) {
      const headers = { authorization: `${scheme} ${tokens.access_token}` }
      expect(await (await request('/api/auth/get-session', { headers })).json()).toBeNull()
      expect((await request('/api/auth/token', { headers })).status).toBe(401)
      expect((await request('/api/auth/account/connected-apps', { headers })).status).toBe(401)
      expect((await request('/api/auth/account/connected-apps/disconnect', { headers, body: { clientId } })).status).toBe(401)
      expect((await request('/api/auth/account/set-password', { headers, body: { newPassword: password } })).status).toBe(401)
    }
  })
})

describe('DPoP', () => {
  it('binds the token to the key of a proof at the token endpoint, and takes it only with a proof from that key', async () => {
    const { register, signIn, connect, exchange, refresh, authenticate } = await serve()
    const clientId = await register()
    const tokenEndpoint = `${origin}/api/auth/oauth2/token`
    const response = await exchange(clientId, await connect(await signIn('ana@example.com'), clientId), { dpop: await dpopProof(tokenEndpoint) })
    expect(response.status, await response.clone().text()).toBe(200)
    const tokens = (await response.json()) as Tokens
    expect(tokens.token_type).toBe('DPoP')
    expect(decodeJwt(tokens.access_token).cnf).toEqual({ jkt: await calculateJwkThumbprint(dpopJwk) })
    const verify = authenticate.forAudience(resource)
    expect(await verify(resourceRequest(tokens.access_token, 'DPoP', await dpopProof(resource, tokens.access_token)))).toMatchObject({ client: { id: clientId } })
    await expect(Promise.resolve().then(() => verify(resourceRequest(tokens.access_token)))).rejects.toMatchObject({ status: 401 })
    const refreshed = await refresh(clientId, tokens.refresh_token!, { dpop: await dpopProof(tokenEndpoint) })
    expect(refreshed.status, await refreshed.clone().text()).toBe(200)
    expect(((await refreshed.json()) as Tokens).token_type).toBe('DPoP')
  })
})

describe("an MCP token ends with its user's standing, read on every request", () => {
  it('when the role it carries is taken away, by the CLI or straight in the store, and the refresh is refused', async () => {
    for (const lower of [
      (app: Awaited<ReturnType<typeof serve>>) => setUserRole(app.auth, { email: 'ana@example.com', role: 'accountant' }),
      (app: Awaited<ReturnType<typeof serve>>) => app.store.query(`update "user" set role = 'accountant' where email = 'ana@example.com'`),
    ]) {
      const app = await serve()
      const ana = await app.grant('ana@example.com')
      const bo = await app.grant('bo@example.com')
      expect(await mcpTakes(app.authenticate, ana.tokens.access_token)).toBe('taken')
      await lower(app)
      expect(await mcpTakes(app.authenticate, ana.tokens.access_token)).toBe(401)
      expect(await mcpTakes(app.authenticate, bo.tokens.access_token)).toBe('taken')
      await app.refused(await app.refresh(ana.clientId, ana.tokens.refresh_token!))
    }
  })

  it('when the user is banned straight in the store, for good or until later, and the refresh is refused', async () => {
    for (const until of [null, new Date('2026-09-01T00:00:00Z')]) {
      const app = await serve()
      const ana = await app.grant('ana@example.com')
      await app.store.query(`update "user" set banned = true, ban_expires = $1 where email = 'ana@example.com'`, [until])
      expect(await mcpTakes(app.authenticate, ana.tokens.access_token)).toBe(401)
      await app.refused(await app.refresh(ana.clientId, ana.tokens.refresh_token!))
    }
  })

  it('when the CLI deletes the user, with their consents and refresh tokens', async () => {
    const app = await serve()
    const ana = await app.grant('ana@example.com')
    const id = await app.userId('ana@example.com')
    await deleteUser(app.auth, 'ana@example.com')
    expect(await mcpTakes(app.authenticate, ana.tokens.access_token)).toBe(401)
    expect((await app.store.query(`select id from oauth_consent where user_id = $1 union all select id from oauth_refresh_token where user_id = $1`, [id])).rows).toEqual([])
    expect((await app.refresh(ana.clientId, ana.tokens.refresh_token!)).status).toBe(400)
  })
})

describe('securing the account', () => {
  type Served = Awaited<ReturnType<typeof serve>>
  type Secured = { app: Served; clientId: string; refreshToken: string; cookie: string }

  // A grant of Ana's, one of Bo's, and a route that secures Ana's account; then Ana's client is disconnected and
  // forgotten, its access token refused at once, and Bo's keeps working.
  const securing = async (secure: (served: Secured) => Promise<void>, options: Partial<CreateAuthOptions> = {}) => {
    const app = await serve(options)
    const ana = await app.grant('ana@example.com')
    const bo = await app.grant('bo@example.com')
    expect(await app.givesCodeSilently(ana.cookie, ana.clientId)).toBe(true)
    expect(await mcpTakes(app.authenticate, ana.tokens.access_token)).toBe('taken')
    await secure({ app, clientId: ana.clientId, refreshToken: ana.tokens.refresh_token!, cookie: ana.cookie })
    expect(await mcpTakes(app.authenticate, ana.tokens.access_token)).toBe(401)
    expect(await mcpTakes(app.authenticate, bo.tokens.access_token)).toBe('taken')
    await app.refused(await app.refresh(ana.clientId, ana.tokens.refresh_token!))
    expect(await app.consents('ana@example.com')).toEqual([])
    await app.asksAgain(await app.signIn('ana@example.com'), ana.clientId)
    expect((await app.refresh(bo.clientId, bo.tokens.refresh_token!)).status).toBe(200)
    return app
  }

  const ok = (response: Response) => expect(response.status, `${response.url}`).toBe(200)

  it('by signing out everywhere', async () => {
    await securing(async ({ app, cookie }) => ok(await app.request('/api/auth/revoke-sessions', { cookie, body: {} })))
  })

  it('by signing out the other devices', async () => {
    await securing(async ({ app }) => ok(await app.request('/api/auth/revoke-other-sessions', { cookie: await app.signIn('ana@example.com'), body: {} })))
  })

  it('by changing the password and signing out the other devices', async () => {
    await securing(async ({ app, cookie }) => ok(await app.request('/api/auth/change-password', { cookie, body: { currentPassword: password, newPassword: password, revokeOtherSessions: true } })))
  })

  // The GoTrue-compatible endpoints, as supabase-js calls them, with an access token of their own.
  const goTrue = '/api/sb/auth/v1'
  const goTrueToken = async (response: Response) => {
    expect(response.status, await response.clone().text()).toBe(200)
    return ((await response.json()) as { access_token: string }).access_token
  }
  const goTrueSignIn = async (app: Served) => goTrueToken(await app.request(`${goTrue}/token?grant_type=password`, { body: { email: 'ana@example.com', password } }))
  const noContent = (response: Response) => expect(response.status, `${response.url}`).toBe(204)

  it('by signing out everywhere through the GoTrue-compatible endpoints', async () => {
    await securing(async ({ app }) => noContent(await app.request(`${goTrue}/logout`, { body: {}, headers: { authorization: `Bearer ${await goTrueSignIn(app)}` } })))
  })

  it('by signing out the other sessions through the GoTrue-compatible endpoints', async () => {
    await securing(async ({ app }) => noContent(await app.request(`${goTrue}/logout?scope=others`, { body: {}, headers: { authorization: `Bearer ${await goTrueSignIn(app)}` } })))
  })

  it('by recovering the account and setting a password through the GoTrue-compatible endpoints', async () => {
    const { mailer, last } = recordingMailer()
    await securing(async ({ app }) => {
      ok(await app.request(`${goTrue}/recover`, { body: { email: 'ana@example.com' } }))
      const code = /^\d{6}$/m.exec(await last('ana@example.com'))![0]
      const token = await goTrueToken(await app.request(`${goTrue}/verify`, { body: { email: 'ana@example.com', token: code, type: 'recovery' } }))
      ok(await app.request(`${goTrue}/user`, { method: 'PUT', body: { password }, headers: { authorization: `Bearer ${token}` } }))
    }, { mailer })
  })

  it('by resetting the password with an emailed link', async () => {
    const { mailer, last } = recordingMailer()
    await securing(async ({ app }) => {
      ok(await app.request('/api/auth/request-password-reset', { body: { email: 'ana@example.com', redirectTo: `${origin}/` } }))
      const token = /reset-password\/([^?\s"]+)/.exec(await last('ana@example.com'))![1]!
      ok(await app.request('/api/auth/reset-password', { body: { newPassword: password, token } }))
    }, { mailer })
  })

  it('by an admin ending the sessions, banning, setting the password, or marking the address unverified', async () => {
    const actions = [
      (userId: string) => ['/api/auth/admin/revoke-user-sessions', { userId }] as const,
      (userId: string) => ['/api/auth/admin/ban-user', { userId }] as const,
      (userId: string) => ['/api/auth/admin/set-user-password', { userId, newPassword: password }] as const,
      (userId: string) => ['/api/auth/admin/update-user', { userId, data: { banned: true } }] as const,
      (userId: string) => ['/api/auth/admin/update-user', { userId, data: { banned: 'true' } }] as const,
      (userId: string) => ['/api/auth/admin/update-user', { userId, data: { emailVerified: false } }] as const,
    ]
    for (const action of actions) {
      const app = await securing(async ({ app }) => {
        const [path, body] = action(await app.userId('ana@example.com'))
        ok(await app.request(path, { cookie: await app.signIn('root@example.com'), body }))
        // Lifting the ban, or verifying the address again, brings no client back.
        await app.store.query(`update "user" set banned = false, email_verified = true where email = 'ana@example.com'`)
      })
      expect(app).toBeDefined()
    }
  })

  it('by the CLI disabling the user; enabling them again brings no client back', async () => {
    await securing(async ({ app }) => {
      await setUserBanned(app.auth, { email: 'ana@example.com', banned: true })
      await setUserBanned(app.auth, { email: 'ana@example.com', banned: false })
    })
  })

  it('but not by an admin refused, or by someone who is not one', async () => {
    const { grant, request, signIn, userId, refresh, consents } = await serve()
    const ana = await grant('ana@example.com')
    const bo = await signIn('bo@example.com')
    for (const [path, body] of [
      ['/api/auth/admin/revoke-user-sessions', { userId: await userId('ana@example.com') }],
      ['/api/auth/admin/ban-user', { userId: await userId('ana@example.com') }],
      ['/api/auth/admin/update-user', { userId: await userId('ana@example.com'), data: { banned: true } }],
    ] as const) {
      expect((await request(path, { cookie: bo, body })).status, path).toBe(403)
    }
    expect((await refresh(ana.clientId, ana.tokens.refresh_token!)).status).toBe(200)
    expect(await consents('ana@example.com')).toHaveLength(1)
  })

  it('but not by signing out of one browser', async () => {
    const { grant, request, refresh, consents, authenticate } = await serve()
    const { clientId, cookie, tokens } = await grant()
    expect((await request('/api/auth/sign-out', { cookie, body: {} })).status).toBe(200)
    expect(await mcpTakes(authenticate, tokens.access_token)).toBe('taken')
    expect((await refresh(clientId, tokens.refresh_token!)).status).toBe(200)
    expect(await consents('ana@example.com')).toHaveLength(1)
  })

  it('but not by setting a first password, which signs nobody out', async () => {
    const { grant, request, refresh, consents, authenticate, store, userId } = await serve()
    const { clientId, cookie, tokens } = await grant()
    await store.query(`update account set password = null where provider_id = 'credential' and user_id = $1`, [await userId('ana@example.com')])
    expect((await request('/api/auth/account/set-password', { cookie, body: { newPassword: password } })).status).toBe(200)
    expect(await mcpTakes(authenticate, tokens.access_token)).toBe('taken')
    expect((await refresh(clientId, tokens.refresh_token!)).status).toBe(200)
    expect(await consents('ana@example.com')).toHaveLength(1)
  })

  // Signing out the other devices keeps the session the code came from: the consent check refuses it (`invalid_grant`).
  // A password change gives the browser a new session, so the code's ended with the others (`invalid_request`).
  it('also refuses a code issued just before', async () => {
    const { register, signIn, connect, exchange, request } = await serve()
    const clientId = await register()
    const cookie = await signIn('ana@example.com')
    await exchange(clientId, await connect(cookie, clientId))
    for (const secure of [
      () => request('/api/auth/revoke-other-sessions', { cookie, body: {} }),
      () => request('/api/auth/change-password', { cookie, body: { currentPassword: password, newPassword: password, revokeOtherSessions: true } }),
    ]) {
      const code = await connect(cookie, clientId)
      expect((await secure()).status).toBe(200)
      const exchanged = await exchange(clientId, code)
      expect(exchanged.status).toBe(400)
      expect(await exchanged.json()).not.toHaveProperty('access_token')
    }
  })
})

describe('a reused refresh token', () => {
  it("disconnects its client, so the client's access tokens are refused at once, and leaves the person's other clients", async () => {
    const served = await serve()
    const { grant, refresh, refused, consents, authenticate, store } = served
    const first = await grant()
    const second = await grant('ana@example.com', first.cookie)
    const rotated = await refresh(first.clientId, first.tokens.refresh_token!)
    expect(rotated.status).toBe(200)
    const { access_token: current } = (await rotated.json()) as Tokens
    expect(await mcpTakes(authenticate, current)).toBe('taken')
    // Presented again once its replay window is over, which the clock standing still never ends: taken for stolen.
    await store.query(`update oauth_refresh_token set rotation_replay_expires_at = $1 where revoked is not null`, [new Date(Date.now() - 1000)])
    await refused(await refresh(first.clientId, first.tokens.refresh_token!))
    expect(await mcpTakes(authenticate, current)).toBe(401)
    expect(await mcpTakes(authenticate, first.tokens.access_token)).toBe(401)
    expect(await mcpTakes(authenticate, second.tokens.access_token)).toBe('taken')
    expect(await consents('ana@example.com')).toHaveLength(1)

    // The person allows the client again: the access token issued before the reuse, perhaps the thief's, stays refused.
    await reconnect(served, first.cookie, first.clientId)
    expect(await mcpTakes(authenticate, current)).toBe(401)
  })
})

describe('a grant whose account changed', () => {
  it('gives no token, nor a refresh token, under prompt=none', async () => {
    const changes = [
      `update "user" set email_verified = false where email = 'ana@example.com'`,
      `update "user" set role = 'accountant' where email = 'ana@example.com'`,
    ]
    for (const change of changes) {
      const { grant, store, authorize, exchange, refused } = await serve()
      const { clientId, cookie } = await grant()
      await store.query(change)
      const { location, verifier } = await authorize(cookie, clientId, { prompt: 'none' })
      const answered = new URL(location)
      const code = answered.searchParams.get('code')
      if (code === null) expect(answered.searchParams.get('error')).toBe('consent_required')
      else await refused(await exchange(clientId, { code, verifier }))
      expect((await store.query(`select count(*)::int as count from oauth_refresh_token`)).rows).toEqual([{ count: 1 }])
    }
  })
})

describe('connected apps', () => {
  type App = { clientId: string; name?: string; allowedAt: string; access: { role: string; organization?: string }[] }
  const list = async (request: Awaited<ReturnType<typeof serve>>['request'], cookie: string, query = '') =>
    ((await (await request(`/api/auth/account/connected-apps${query}`, { cookie })).json()) as { apps: App[] }).apps

  it('lists the clients the person allowed, and disconnects one of them', async () => {
    const served = await serve()
    const { grant, request, signIn, refresh, refused, asksAgain, connect, exchange, authenticate } = served
    const first = await grant()
    const second = await grant('ana@example.com', first.cookie)
    const apps = await list(request, first.cookie)
    expect(apps.map((app) => app.clientId).toSorted()).toEqual([first.clientId, second.clientId].toSorted())
    expect(apps[0]).toMatchObject({ name: 'Test Client', allowedAt: '2026-08-01T00:00:00.000Z', access: [{ role: 'sales' }] })
    expect(await list(request, await signIn('bo@example.com'))).toEqual([])

    // A code the client got just before is refused after.
    const code = await connect(first.cookie, first.clientId)
    expect(await (await request('/api/auth/account/connected-apps/disconnect', { cookie: first.cookie, body: { clientId: first.clientId } })).json()).toEqual({ disconnected: true })
    expect(await mcpTakes(authenticate, first.tokens.access_token)).toBe(401)
    expect(await mcpTakes(authenticate, second.tokens.access_token)).toBe('taken')
    await refused(await exchange(first.clientId, code))
    await refused(await refresh(first.clientId, first.tokens.refresh_token!))
    await asksAgain(first.cookie, first.clientId)
    expect((await refresh(second.clientId, second.tokens.refresh_token!)).status).toBe(200)
    expect((await list(request, first.cookie)).map((app) => app.clientId)).toEqual([second.clientId])

    // Allowed again, the client's access token from before stays refused.
    await reconnect(served, first.cookie, first.clientId)
    expect(await mcpTakes(authenticate, first.tokens.access_token)).toBe(401)
  })

  it("acts on the person's own grants only, whatever the request names", async () => {
    const { request, signIn, refresh, userId, connect, exchange } = await serve()
    // Ana and Bo both allowed the same published client.
    const allow = async (email: string) => {
      const cookie = await signIn(email)
      const tokens = (await (await exchange(cimdClientId, await connect(cookie, cimdClientId))).json()) as Tokens
      return { cookie, tokens }
    }
    const ana = await allow('ana@example.com')
    const bo = await allow('bo@example.com')
    expect(await list(request, ana.cookie, `?userId=${await userId('bo@example.com')}`)).toHaveLength(1)
    const disconnected = await request('/api/auth/account/connected-apps/disconnect', { cookie: ana.cookie, body: { clientId: cimdClientId, userId: await userId('bo@example.com') } })
    expect([200, 400]).toContain(disconnected.status)
    expect((await refresh(cimdClientId, bo.tokens.refresh_token!)).status).toBe(200)
    expect(await list(request, bo.cookie)).toMatchObject([{ clientId: cimdClientId, name: 'Example Client' }])
  })

  it('disconnects a client never allowed as nothing at all', async () => {
    const { grant, request } = await serve()
    const { cookie, clientId, tokens } = await grant()
    expect(await (await request('/api/auth/account/connected-apps/disconnect', { cookie, body: { clientId: 'never-allowed' } })).json()).toEqual({ disconnected: true })
    expect((await list(request, cookie)).map((app) => app.clientId)).toEqual([clientId])
    expect(tokens.refresh_token).toBeTruthy()
  })

  it('takes no disconnect by GET, and gives no CORS', async () => {
    const { grant, request } = await serve()
    const { cookie, clientId } = await grant()
    expect([404, 405]).toContain((await request(`/api/auth/account/connected-apps/disconnect?clientId=${clientId}`, { cookie })).status)
    const listed = await request('/api/auth/account/connected-apps', { cookie, from: 'https://evil.example' })
    expect(listed.headers.get('access-control-allow-origin')).toBeNull()
    expect((await list(request, cookie)).map((app) => app.clientId)).toEqual([clientId])
  })
})

describe('turning MCP off', () => {
  const tables = ['oauth_client', 'oauth_resource', 'oauth_client_resource', 'oauth_refresh_token', 'oauth_access_token', 'oauth_consent', 'oauth_client_assertion']
  const leftover = /still has the tables of the OAuth provider for MCP .*which is off.*`protobase auth migration`/
  const listed = (message: string) => /\(([^)]*)\)/.exec(message)![1]!.split(', ').sort()
  const failure = async (check: Promise<unknown>) => ((await check.then(() => expect.unreachable(), (error: Error) => error)) as Error).message

  it('forgets every client and grant, so turning MCP on again starts from nothing', async () => {
    const first = await serve()
    const { store } = first
    const cookie = await first.signIn('ana@example.com')
    const cimd = await first.exchange(cimdClientId, await first.connect(cookie, cimdClientId))
    expect(cimd.status, await cimd.clone().text()).toBe(200)
    const cimdTokens = (await cimd.json()) as Tokens
    const registered = await first.grant('ana@example.com', cookie)
    // A code issued while MCP is on, and never redeemed.
    const pending = await first.connect(cookie, cimdClientId)

    // Off: the app refuses to start until the tables are dropped, and a ban, here Bo's so Ana's session and its code
    // stay, writes none of them.
    const off = await authOn(store, { mcp: undefined })
    const refusal = await failure(checkAuthSchema(off))
    expect(refusal).toMatch(leftover)
    expect(listed(refusal)).toEqual([...tables].sort())
    await setUserBanned(off, { email: 'bo@example.com', banned: true })
    await setUserBanned(off, { email: 'bo@example.com', banned: false })
    const drop = (await authSchemaMigration(off))!
    for (const table of tables) expect(drop).toMatch(new RegExp(`drop table if exists .*"${table}"`))
    await store.exec(drop)
    await expect(checkAuthSchema(off)).resolves.toBeUndefined()
    expect(await authSchemaMigration(off)).toBeUndefined()

    // On again: every table is missing, so the drop left none behind; the migration makes them empty.
    const on = await authOn(store)
    const missing = await failure(checkAuthSchema(on))
    for (const table of tables) expect(missing).toMatch(new RegExp(`missing .*\\b${table}\\b`))
    await store.exec((await authSchemaMigration(on))!)
    const second = await serve({}, store)

    // Nothing of before is taken: the refresh tokens, the pending code, or the consent.
    await second.refused(await second.refresh(cimdClientId, cimdTokens.refresh_token!))
    const registeredRefresh = await second.refresh(registered.clientId, registered.tokens.refresh_token!)
    expect(registeredRefresh.status).not.toBe(200)
    expect(await registeredRefresh.json()).not.toHaveProperty('access_token')
    const redeemed = await second.exchange(cimdClientId, pending)
    expect(redeemed.status).toBe(400)
    expect(await redeemed.json()).toMatchObject({ error: 'invalid_grant' })
    expect((await store.query('select id from oauth_refresh_token')).rows).toEqual([])
    const again = await second.signIn('ana@example.com')
    await second.asksAgain(again, cimdClientId)

    // Allowed again, the client works as new, and the old refresh token stays refused.
    const allowed = await second.exchange(cimdClientId, await second.connect(again, cimdClientId))
    expect(allowed.status, await allowed.clone().text()).toBe(200)
    const tokens = (await allowed.json()) as Tokens
    expect(await second.authenticate.forAudience(resource)(resourceRequest(tokens.access_token))).toMatchObject({ user: { id: await second.userId('ana@example.com') } })
    expect((await second.refresh(cimdClientId, tokens.refresh_token!)).status).toBe(200)
    await second.refused(await second.refresh(cimdClientId, cimdTokens.refresh_token!))
  })

  it('names and drops only the tables left over, in the store\'s schema alone', async () => {
    const store = await openSnapshotDb('empty')
    await store.exec(`create schema auth; create table public.oauth_client (id text primary key); insert into public.oauth_client values ('app-row')`)
    const database = { dialect: store.dialect, type: 'postgres' as const, schemaName: 'auth' }
    const on = await authOn(store, { database })
    await store.exec((await authSchemaMigration(on))!)
    // Only the consents and refresh tokens are left, with a grant of Ana's in them.
    await store.exec(`
      drop table auth.oauth_access_token, auth.oauth_client_assertion, auth.oauth_client_resource, auth.oauth_resource, auth.oauth_client cascade;
      insert into auth."user" (id, name, email, email_verified, created_at, updated_at) values ('u1', 'Ana', 'ana@example.com', true, now(), now());
      insert into auth.oauth_consent (id, client_id, user_id, scopes, created_at, updated_at) values ('c1', 'x', 'u1', '["mcp"]', now(), now());
      insert into auth.oauth_refresh_token (id, token, client_id, user_id, scopes, expires_at, created_at) values ('r1', 't', 'x', 'u1', '["mcp"]', now() + interval '30 days', now());
    `)

    const off = await authOn(store, { database, mcp: undefined })
    const refusal = await failure(checkAuthSchema(off))
    expect(refusal).toMatch(leftover)
    expect(listed(refusal)).toEqual(['oauth_consent', 'oauth_refresh_token'])
    const drop = (await authSchemaMigration(off))!
    for (const table of tables) expect(drop).toContain(`"auth"."${table}"`)
    await store.exec(drop)
    await expect(checkAuthSchema(off)).resolves.toBeUndefined()
    expect(await authSchemaMigration(off)).toBeUndefined()
    expect((await store.query('select id from public.oauth_client')).rows).toEqual([{ id: 'app-row' }])
  })

  // The previous bundle, MCP on, still serving once the deploy's migrate phase dropped the tables: its revocation fails
  // on the missing tables, but only after the action that secures the account, which takes effect.
  it('leaves an app with MCP on, serving after the drop, securing accounts and giving no token or code', async () => {
    const { mailer, sent } = recordingMailer()
    // The text of the next mail to Ana, once it is sent.
    const nextMail = async (send: () => Response | Promise<Response>) => {
      const before = sent.length
      expect((await send()).status).toBe(200)
      await expect.poll(() => sent.length, { timeout: 10_000 }).toBeGreaterThan(before)
      return sent.at(-1)!.text
    }
    const app = await serve({ mailer })
    const ana = await app.grant('ana@example.com')
    const pending = await app.connect(ana.cookie, ana.clientId)
    await app.store.exec(dropMcpTables())

    const noToken = async (response: Response) => {
      expect(response.status).not.toBe(200)
      expect(await response.text()).not.toContain('access_token')
    }
    await noToken(await app.refresh(ana.clientId, ana.tokens.refresh_token!))
    await noToken(await app.exchange(ana.clientId, pending))
    expect((await app.authorize(ana.cookie, ana.clientId, { prompt: 'none' })).location).not.toMatch(/[?&]code=/)

    const signInWith = (secret: string) => app.request('/api/auth/sign-in/email', { body: { email: 'ana@example.com', password: secret } })
    const session = async (cookie: string) => (await app.request('/api/auth/get-session', { cookie })).json()
    const goTrue = '/api/sb/auth/v1'
    const goTrueToken = async (response: Response) => {
      expect(response.status, await response.clone().text()).toBe(200)
      return ((await response.json()) as { access_token: string }).access_token
    }

    // Signing out everywhere through the GoTrue-compatible endpoints ends Ana's other sessions.
    const other = await app.signIn('ana@example.com')
    expect(await session(other)).toMatchObject({ user: { email: 'ana@example.com' } })
    const signedIn = await goTrueToken(await app.request(`${goTrue}/token?grant_type=password`, { body: { email: 'ana@example.com', password } }))
    await app.request(`${goTrue}/logout`, { body: {}, headers: { authorization: `Bearer ${signedIn}` } })
    expect(await session(other)).toBeNull()

    // A new password set through the GoTrue-compatible endpoints holds.
    const second = 'second horse battery'
    const code = /^\d{6}$/m.exec(await nextMail(() => app.request(`${goTrue}/recover`, { body: { email: 'ana@example.com' } })))![0]
    const recovery = await goTrueToken(await app.request(`${goTrue}/verify`, { body: { email: 'ana@example.com', token: code, type: 'recovery' } }))
    await app.request(`${goTrue}/user`, { method: 'PUT', body: { password: second }, headers: { authorization: `Bearer ${recovery}` } })
    expect((await signInWith(password)).status).not.toBe(200)
    expect((await signInWith(second)).status).toBe(200)

    // So does a password reset with an emailed link.
    const third = 'third horse battery'
    const token = /reset-password\/([^?\s"]+)/.exec(await nextMail(() => app.request('/api/auth/request-password-reset', { body: { email: 'ana@example.com', redirectTo: `${origin}/` } })))![1]!
    await app.request('/api/auth/reset-password', { body: { newPassword: third, token } })
    expect((await signInWith(second)).status).not.toBe(200)
    expect((await signInWith(third)).status).toBe(200)

    // A ban holds, and ends her sessions.
    const browser = cookieOf(await signInWith(third))
    await expect(setUserBanned(app.auth, { email: 'ana@example.com', banned: true })).rejects.toThrow(/oauth_consent/)
    expect((await app.store.query<{ banned: boolean }>(`select banned from "user" where email = 'ana@example.com'`)).rows).toEqual([{ banned: true }])
    expect(await session(browser)).toBeNull()
  })

  it('still names a missing core table, and no MCP table', async () => {
    const store = await base.clone()
    await store.exec('drop table verification')
    const off = await authOn(store, { mcp: undefined })
    const refusal = await failure(checkAuthSchema(off))
    expect(refusal).toMatch(/missing verification/)
    expect(refusal).not.toMatch(/oauth_/)
  })
})
