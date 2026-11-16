import { Kysely } from 'kysely'
import { expect } from 'vitest'
import { betterAuthAuthenticator } from '../../src/better-auth/authenticator'
import { createAuth, type CreateAuthOptions } from '../../src/better-auth/create-auth'
import { defaultSignInPolicy, type SignInPolicy } from '../../src/better-auth/sign-in-policy'
import { createUser } from '../../src/better-auth/users'
import { createAdmin } from '../../src/create-admin'
import { startFakeOidcProvider, type TokenTwist } from './fake-oidc-provider'
import type { SnapshotDb } from '../../../../test-support/sql-snapshot'

export const origin = 'http://localhost:5173'
export const password = 'correct horse battery'
export const issuer = 'https://auth.platform.example'
export const client = { clientId: 'localhost', clientSecret: 'platform-client-secret' }
const secret = 'test-secret-test-secret-test-secret-1234'

export const cookiesOf = (response: Response) => response.headers.getSetCookie().map((line) => line.split(';')[0]!)

/** The claims of a person as the platform's provider vouches for them. */
export const octo = (changes: Record<string, unknown> = {}) => ({ sub: '4242', email: 'octo@example.com', email_verified: true, name: 'Octo Cat', ...changes })

export type PlatformApp = Partial<CreateAuthOptions> & { provider?: string; discoveredIssuer?: string; tokenSignIn?: boolean }

// Better Auth's rate limits are per client address and kept in memory, so every app gets an address of its own.
let address = 0

/**
 * An app on a copy of `shared`'s migrated store with an admin (`root@example.com`) and the platform's provider, with
 * token sign-in when `tokenSignIn` asks for it, and a client address of its own.
 */
export const servePlatformApp = async (shared: SnapshotDb, appDb: Kysely<any>, { provider = 'github', discoveredIssuer, tokenSignIn, ...options }: PlatformApp = {}) => {
  const platform = await startFakeOidcProvider({ issuer, client, ...(discoveredIssuer && { discoveredIssuer }) })
  const store = await shared.clone()
  const auth = createAuth({
    database: { dialect: store.dialect, type: 'postgres' },
    baseURL: origin,
    secret,
    mailer: false,
    operator: false,
    signInProvider: { issuer, ...client, provider, ...(tokenSignIn && { tokenSignIn }) },
    ...options,
  })
  await createUser(auth, { email: 'root@example.com', password })
  const app = createAdmin({ resources: [], db: appDb, authenticate: betterAuthAuthenticator({ auth }), auth })
  const from = `203.0.113.${++address}`
  const request = (path: string, init: { body?: unknown; cookie?: string } = {}) =>
    app.request(`${origin}/api/auth${path}`, {
      method: init.body === undefined ? 'GET' : 'POST',
      headers: { 'content-type': 'application/json', origin, 'x-forwarded-for': from, ...(init.cookie && { cookie: init.cookie }) },
      ...(init.body !== undefined && { body: JSON.stringify(init.body) }),
    })
  const signIn = async (email: string) => cookiesOf(await request('/sign-in/email', { body: { email, password } })).join('; ')
  const savePolicy = async (changes: Partial<SignInPolicy>) => {
    const saved = await request('/policy/sign-in', { cookie: await signIn('root@example.com'), body: { ...defaultSignInPolicy, ...changes } })
    expect(saved.status).toBe(200)
  }

  // The person's browser: start at the app, sign in at the provider, and come back through the callback.
  const platformSignIn = async (claims: Record<string, unknown>, twist?: TokenTwist) => {
    const start = await request('/sign-in/social', { body: { provider, callbackURL: `${origin}/`, errorCallbackURL: `${origin}/`, disableRedirect: true } })
    expect(start.status).toBe(200)
    const { url } = (await start.json()) as { url: string }
    const { code, state } = platform.approve(url, claims, twist)
    const callback = await request(`/callback/${provider}?code=${code}&state=${encodeURIComponent(state)}`, { cookie: cookiesOf(start).join('; ') })
    const cookie = cookiesOf(callback).join('; ')
    const session = cookie ? await (await request('/get-session', { cookie })).json() : null
    return { url, callback, session, location: callback.headers.get('location') }
  }

  const accounts = async () =>
    (await store.query<{ email: string; providerId: string; accountId: string }>(`select u.email, a.provider_id as "providerId", a.account_id as "accountId" from account a join "user" u on u.id = a.user_id where a.provider_id <> 'credential' order by u.email`)).rows
  return { auth, store, platform, request, signIn, savePolicy, platformSignIn, accounts }
}
