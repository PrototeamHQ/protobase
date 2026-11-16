import { createLocalJWKSet, jwtVerify, type JSONWebKeySet } from 'jose'
import { expect } from 'vitest'
import { betterAuthAuthenticator } from '../../src/better-auth/authenticator'
import { buildAuth, type CreateAuthOptions } from '../../src/better-auth/create-auth'
import { createUser } from '../../src/better-auth/users'
import { createAdmin } from '../../src/create-admin'
import { allResources } from '../../../../test-support/server'
import { settled, type SnapshotDb } from '../../../../test-support/sql-snapshot'
import { cookieOf, origin, password, pkce, secret, type McpStores } from './mcp-app'

export const webCallback = 'https://shop.example.com/api/auth/callback/oidc'
export const phoneCallback = 'com.example.phone:/signed-in'

export type Registered = { clientId: string; clientSecret?: string }

// Each app's requests come from an address of their own, so one test's never count toward another's rate limit.
let client = 0

/**
 * An app with the OpenID provider on, on a copy of the migrated store, with Root (admin) and Ana (sales); `auth` adds
 * or replaces options. Its helpers drive the provider as a client and a browser do.
 */
export const serveOpenId = async (stores: McpStores, options: Partial<CreateAuthOptions> = {}) => {
  const store: SnapshotDb = await stores.migrated.clone()
  const auth = await buildAuth({ database: { dialect: store.dialect, type: 'postgres' }, baseURL: origin, secret, mailer: false, signInPerMinute: 100, roles: ['admin', 'sales'], defaultRole: 'sales', openIdProvider: true, ...options })
  await auth.$context
  await settled()
  await createUser(auth, { email: 'root@example.com', password })
  await createUser(auth, { email: 'ana@example.com', password, role: 'sales' })
  const app = createAdmin({ resources: allResources, db: stores.fixture.db, authenticate: betterAuthAuthenticator({ auth }), auth })

  const address = `198.51.100.${++client}`

  type Init = { body?: unknown; form?: Record<string, string>; cookie?: string; headers?: Record<string, string>; from?: string | null }
  const request = (path: string, { body, form, cookie, headers = {}, from = origin }: Init = {}) =>
    app.request(`${origin}${path}`, {
      method: body === undefined && form === undefined ? 'GET' : 'POST',
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

  const signIn = async (email: string) => {
    const response = await request('/api/auth/sign-in/email', { body: { email, password } })
    expect(response.status).toBe(200)
    return cookieOf(response)
  }

  /** Root registers a client through the operator API. */
  const register = async (body: Record<string, unknown>): Promise<Registered> => {
    const response = await request('/api/auth/openid-provider/clients', { cookie: await signIn('root@example.com'), body })
    expect(response.status, await response.clone().text()).toBe(200)
    return (await response.json()) as Registered
  }
  const registerWeb = () => register({ name: 'Shop', redirectUris: [webCallback], type: 'confidential' })
  const registerPhone = () => register({ name: 'Phone', redirectUris: [phoneCallback], type: 'public', exchange: true })

  /** `GET /oauth2/authorize` as the browser sends it, with PKCE and a nonce; `params` adds or replaces parameters. */
  const authorize = async (cookie: string | undefined, clientId: string, params: Record<string, string> = {}) => {
    const { verifier, challenge } = await pkce()
    const query = new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: webCallback, scope: 'openid email profile', code_challenge: challenge, code_challenge_method: 'S256', state: 'st4te', nonce: 'n0nce', ...params })
    const response = await request(`/api/auth/oauth2/authorize?${query}`, { ...(cookie && { cookie }), headers: { 'sec-fetch-mode': 'navigate', accept: 'text/html' }, from: null })
    return { response, verifier, location: response.headers.get('location') ?? '' }
  }

  const codeOf = (location: string, redirectUri = webCallback) => {
    expect(location.startsWith(`${redirectUri}?`), location).toBe(true)
    return new URL(location).searchParams.get('code')!
  }

  const token = (form: Record<string, string>, headers: Record<string, string> = {}) => request('/api/auth/oauth2/token', { form, headers, from: null })
  const basic = ({ clientId, clientSecret }: Registered) => ({ authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}` })

  /** A signed-in browser sent through authorize for `client`, and the code traded for its tokens. */
  const codeFlow = async (client: Registered, email = 'ana@example.com', redirectUri = webCallback, scope = 'openid email profile') => {
    const { location, verifier } = await authorize(await signIn(email), client.clientId, { redirect_uri: redirectUri, scope })
    const form = { grant_type: 'authorization_code', code: codeOf(location, redirectUri), redirect_uri: redirectUri, code_verifier: verifier, client_id: client.clientId }
    const response = await token(form, client.clientSecret ? basic(client) : {})
    expect(response.status, await response.clone().text()).toBe(200)
    return (await response.json()) as { access_token: string; id_token: string; refresh_token?: string }
  }

  /** The phone's token exchange of `subjectToken` for an ID token for `audience`; `form` adds or replaces fields. */
  const exchange = (phone: Registered, subjectToken: string, audience: string, form: Record<string, string> = {}) =>
    token({
      grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
      client_id: phone.clientId,
      subject_token: subjectToken,
      subject_token_type: 'urn:ietf:params:oauth:token-type:access_token',
      requested_token_type: 'urn:ietf:params:oauth:token-type:id_token',
      audience,
      ...form,
    })

  /** The ID token's claims, verified against the app's published keys as a receiving app does. */
  const verified = async (idToken: string, audience: string) => {
    const keys = (await (await request('/api/auth/jwks')).json()) as JSONWebKeySet
    return (await jwtVerify(idToken, createLocalJWKSet(keys), { issuer: origin, audience })).payload
  }

  const userId = async (email: string) => (await store.query<{ id: string }>(`select id from "user" where email = $1`, [email])).rows[0]!.id

  return { auth, store, request, signIn, register, registerWeb, registerPhone, authorize, codeOf, token, basic, codeFlow, exchange, verified, userId }
}
