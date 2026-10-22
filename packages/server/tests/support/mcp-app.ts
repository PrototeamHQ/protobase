import { base64url } from 'jose'
import { expect } from 'vitest'
import type { AdminOptions } from '../../src/admin-options'
import { authSchemaMigration } from '../../src/better-auth/auth-schema'
import { betterAuthAuthenticator, type BetterAuthAuthenticator } from '../../src/better-auth/authenticator'
import { createAuth, type CreateAuthOptions } from '../../src/better-auth/create-auth'
import { createUser, setUserRole } from '../../src/better-auth/users'
import { createAdmin } from '../../src/create-admin'
import type { Authenticator } from '../../src/types'
import { allResources, createFixtureDb } from '../../../../test-support/server'
import { openSnapshotDb, settled, type SnapshotDb } from '../../../../test-support/sql-snapshot'

export const origin = 'http://localhost:5173'
export const resource = `${origin}/api/mcp`
export const secret = 'test-secret-test-secret-test-secret-1234'
export const password = 'correct horse battery'
export const redirectUri = 'http://127.0.0.1:33418/callback'

// A client metadata document (CIMD) the stub serves instead of the network.
export const cimdClientId = 'https://client.example.com/oauth/client.json'
export const cimdDocument = { client_id: cimdClientId, client_name: 'Example Client', redirect_uris: [redirectUri], token_endpoint_auth_method: 'none' }
export const fetchClientMetadata = async (url: string | URL) =>
  String(url) === cimdClientId ? new Response(JSON.stringify(cimdDocument), { headers: { 'content-type': 'application/json' } }) : new Response('not found', { status: 404 })

// Made, then given the time to check its schema in the background, so its queries come before the test's.
export const authOn = async (store: SnapshotDb, options: Partial<CreateAuthOptions> = {}) => {
  const auth = createAuth({
    database: { dialect: store.dialect, type: 'postgres' },
    baseURL: origin,
    secret,
    mailer: false,
    signInPerMinute: 100,
    roles: ['admin', 'sales', 'accountant'],
    defaultRole: 'sales',
    mcp: { fetchClientMetadata: fetchClientMetadata as never },
    ...options,
  })
  await auth.$context
  await settled()
  return auth
}

/**
 * The stores an MCP test serves from: the fixture database, an auth store before and after the auth migration with MCP
 * on, and that migration. Made in `beforeAll`; destroy `fixture.db` in `afterAll`.
 */
export const mcpStores = async () => {
  const fixture = await createFixtureDb()
  const base = await openSnapshotDb('auth')
  const migrated = await base.clone()
  const migration = (await authSchemaMigration(await authOn(migrated)))!
  await migrated.exec(migration)
  return { fixture, base, migrated, migration }
}

export type McpStores = Awaited<ReturnType<typeof mcpStores>>

let client = 0

export const cookieOf = (response: Response) => response.headers.getSetCookie().map((line) => line.split(';')[0]).join('; ')

export const pkce = async () => {
  const verifier = base64url.encode(crypto.getRandomValues(new Uint8Array(32)))
  const challenge = base64url.encode(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))))
  return { verifier, challenge }
}

export type Tokens = { access_token: string; refresh_token?: string; token_type: string; scope: string; expires_in: number }

export type ServeMcpOptions = {
  auth?: Partial<CreateAuthOptions>
  /** A store served before, with its users as they are, instead of a copy of the migrated one. */
  existing?: SnapshotDb
  /** `createAdmin`'s options. */
  admin?: AdminOptions
  /** Wraps the app's `betterAuthAuthenticator` before `createAdmin`, as a host with its own role mapping does. */
  authenticate?: (own: BetterAuthAuthenticator) => Authenticator
}

/**
 * An app with MCP on, on a copy of the migrated store, with Ana (sales and accountant) and Root (admin); on `existing`,
 * a store served before, with its users as they are.
 */
export const serveMcp = async ({ fixture, migrated }: McpStores, { auth: options = {}, existing, admin, authenticate: wrap = (own) => own }: ServeMcpOptions = {}) => {
  const store = existing ?? (await migrated.clone())
  const auth = await authOn(store, options)
  if (!existing) {
    await createUser(auth, { email: 'root@example.com', password })
    await createUser(auth, { email: 'ana@example.com', password, role: 'sales' })
    await setUserRole(auth, { email: 'ana@example.com', role: 'sales,accountant' })
    await createUser(auth, { email: 'bo@example.com', password, role: 'sales' })
  }
  const authenticate = betterAuthAuthenticator({ auth })
  const app = createAdmin({ resources: allResources, db: fixture.db, authenticate: wrap(authenticate), auth, ...(admin && { options: admin }) })
  const address = `198.51.100.${++client}`

  type Init = { body?: unknown; form?: Record<string, string>; cookie?: string; headers?: Record<string, string>; method?: string; from?: string | null }
  const request = (path: string, init: Init = {}) => {
    const { body, form, cookie, headers = {}, from = origin } = init
    const method = init.method ?? (body === undefined && form === undefined ? 'GET' : 'POST')
    return app.request(path.startsWith('http') ? path : `${origin}${path}`, {
      method,
      redirect: 'manual',
      headers: {
        'x-forwarded-for': address,
        ...(body !== undefined && { 'content-type': 'application/json' }),
        ...(form !== undefined && { 'content-type': 'application/x-www-form-urlencoded' }),
        ...(from !== null && { origin: from }),
        ...(cookie && { cookie }),
        ...headers,
      },
      ...(body !== undefined && { body: JSON.stringify(body) }),
      ...(form !== undefined && { body: new URLSearchParams(form).toString() }),
    })
  }

  const signIn = async (email: string) => {
    const response = await request('/api/auth/sign-in/email', { body: { email, password } })
    expect(response.status).toBe(200)
    return cookieOf(response)
  }

  const register = async (metadata: Record<string, unknown> = {}) => {
    const response = await request('/api/auth/oauth2/register', { body: { redirect_uris: [redirectUri], client_name: 'Test Client', token_endpoint_auth_method: 'none', ...metadata }, from: null })
    expect(response.status, await response.clone().text()).toBe(201)
    return ((await response.json()) as { client_id: string }).client_id
  }

  /** `GET /oauth2/authorize` for `clientId` as the browser sends it, with PKCE; `params` adds or replaces parameters. */
  const authorize = async (cookie: string | undefined, clientId: string, params: Record<string, string | undefined> = {}) => {
    const { verifier, challenge } = await pkce()
    const query = new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: redirectUri, code_challenge: challenge, code_challenge_method: 'S256', state: 'st4te' })
    for (const [name, value] of Object.entries(params)) {
      if (value === undefined) query.delete(name)
      else query.set(name, value)
    }
    const response = await request(`/api/auth/oauth2/authorize?${query}`, { ...(cookie && { cookie }), headers: { 'sec-fetch-mode': 'navigate', accept: 'text/html' }, from: null })
    return { response, verifier, location: response.headers.get('location') ?? '' }
  }

  // The connect page's calls: resuming the signed request, and answering it.
  const resume = (cookie: string, oauthQuery: string) => request('/api/auth/oauth2/continue', { cookie, body: { postLogin: true, oauth_query: oauthQuery } })
  const answer = (cookie: string, oauthQuery: string, accept = true) => request('/api/auth/oauth2/consent', { cookie, body: { accept, oauth_query: oauthQuery } })

  const queryOf = (url: string) => new URL(url, origin).search.slice(1)

  const codeOf = (url: string) => {
    const redirect = new URL(url)
    expect(`${redirect.origin}${redirect.pathname}`).toBe(redirectUri)
    return redirect.searchParams.get('code')!
  }

  /**
   * The code the client gets after the person allows it on the connect page, and the PKCE verifier it goes with; at
   * once, without the page, when the person allowed it before.
   */
  const connect = async (cookie: string, clientId: string, params: Record<string, string | undefined> = {}) => {
    const { response, verifier, location } = await authorize(cookie, clientId, params)
    expect(response.status, await response.clone().text()).toBe(302)
    if (location.startsWith(redirectUri)) return { code: codeOf(location), verifier }
    expect(location.startsWith('/-/connect?')).toBe(true)
    const resumed = await resume(cookie, queryOf(location))
    expect(resumed.status, await resumed.clone().text()).toBe(200)
    const { url } = (await resumed.json()) as { url: string }
    expect(url.startsWith('/-/connect?')).toBe(true)
    const allowed = await answer(cookie, queryOf(url))
    expect(allowed.status, await allowed.clone().text()).toBe(200)
    return { code: codeOf(((await allowed.json()) as { url: string }).url), verifier }
  }

  const token = (form: Record<string, string>, headers: Record<string, string> = {}) => request('/api/auth/oauth2/token', { form, headers, from: null })

  const exchange = async (clientId: string, { code, verifier }: { code: string; verifier: string }, headers: Record<string, string> = {}, extra: Record<string, string> = {}) =>
    token({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: clientId, code_verifier: verifier, ...extra }, headers)

  const refresh = (clientId: string, refreshToken: string, headers: Record<string, string> = {}, extra: Record<string, string> = {}) =>
    token({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: clientId, ...extra }, headers)

  /** Registers a client, signs `email` in, allows the client and exchanges the code: the tokens and the client's id. */
  const grant = async (email = 'ana@example.com', cookie?: string) => {
    const clientId = await register()
    const session = cookie ?? (await signIn(email))
    const response = await exchange(clientId, await connect(session, clientId))
    expect(response.status, await response.clone().text()).toBe(200)
    return { clientId, cookie: session, tokens: (await response.json()) as Tokens }
  }

  const refused = async (response: Response) => {
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: 'invalid_grant' })
  }

  const userId = async (email: string) => (await store.query<{ id: string }>(`select id from "user" where email = $1`, [email])).rows[0]!.id
  const consents = async (email: string) => (await store.query<{ client_id: string }>(`select client_id from oauth_consent where user_id = $1`, [await userId(email)])).rows

  /** Whether the person's browser, signed in, is sent to the connect page again rather than back to the client with a code. */
  const asksAgain = async (cookie: string, clientId: string) => {
    const { location } = await authorize(cookie, clientId)
    expect(location.startsWith('/-/connect?')).toBe(true)
    const silent = new URL((await authorize(cookie, clientId, { prompt: 'none' })).location)
    expect(silent.searchParams.get('error')).toBe('consent_required')
    expect(silent.searchParams.has('code')).toBe(false)
  }

  /** Whether `prompt=none` gives the client a code at once, as for a consent that is remembered. */
  const givesCodeSilently = async (cookie: string, clientId: string) => new URL((await authorize(cookie, clientId, { prompt: 'none' })).location).searchParams.has('code')

  return { auth, store, app, authenticate, request, signIn, register, authorize, resume, answer, connect, exchange, refresh, grant, queryOf, refused, userId, consents, asksAgain, givesCodeSilently }
}
