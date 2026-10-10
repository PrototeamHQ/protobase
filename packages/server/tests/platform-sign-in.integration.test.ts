import { PGlite } from '@electric-sql/pglite'
import { Kysely } from 'kysely'
import { PGliteDialect } from 'kysely-pglite-dialect'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { betterAuthAuthenticator } from '../src/better-auth/authenticator'
import { createAuth, type CreateAuthOptions } from '../src/better-auth/create-auth'
import { defaultSignInPolicy, type SignInPolicy } from '../src/better-auth/sign-in-policy'
import { createUser } from '../src/better-auth/users'
import { createAdmin } from '../src/create-admin'
import { createAuthStore } from '../../../test-support/auth'
import { startFakeOidcProvider, type TokenTwist } from './support/fake-oidc-provider'

const origin = 'http://localhost:5173'
const secret = 'test-secret-test-secret-test-secret-1234'
const password = 'correct horse battery'
const issuer = 'https://auth.platform.example'
const client = { clientId: 'localhost', clientSecret: 'platform-client-secret' }

let shared: PGlite
let appDb: Kysely<any>
beforeAll(async () => {
  shared = await createAuthStore()
  appDb = new Kysely<any>({ dialect: new PGliteDialect(shared) })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// Better Auth's rate limits are per client address and kept in memory, so every app gets an address of its own.
let address = 0

const cookiesOf = (response: Response) => response.headers.getSetCookie().map((line) => line.split(';')[0]!)

/** The claims of a GitHub user as the platform's provider vouches for them. */
const octo = (changes: Record<string, unknown> = {}) => ({ sub: '4242', email: 'octo@example.com', email_verified: true, name: 'Octo Cat', ...changes })

type Serve = Partial<CreateAuthOptions> & { provider?: string; discoveredIssuer?: string }

// Every app gets a copy of the migrated store with an admin, the platform's provider, and a client address of its own.
const serve = async ({ provider = 'github', discoveredIssuer, ...options }: Serve = {}) => {
  const platform = await startFakeOidcProvider({ issuer, client, ...(discoveredIssuer && { discoveredIssuer }) })
  const store = (await shared.clone()) as PGlite
  const auth = createAuth({
    database: { dialect: new PGliteDialect(store), type: 'postgres' },
    baseURL: origin,
    secret,
    mailer: false,
    operator: false,
    signInProvider: { issuer, ...client, provider },
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
    (await store.query<{ email: string; providerId: string; accountId: string }>(`select u.email, a."providerId", a."accountId" from account a join "user" u on u.id = a."userId" where a."providerId" <> 'credential' order by u.email`)).rows
  return { auth, store, platform, request, signIn, savePolicy, platformSignIn, accounts }
}

describe('sign-in through the platform provider', () => {
  it('is offered on the status with its name, and asks the provider with PKCE, a nonce and the callback of its id', async () => {
    const { request, platformSignIn } = await serve()
    expect(await (await request('/status')).json()).toMatchObject({ socialProviders: ['github'], platformSignIn: { provider: 'github', name: 'GitHub' } })
    const { url } = await platformSignIn(octo())
    const authorize = new URL(url)
    expect(authorize.origin + authorize.pathname).toBe(`${issuer}/authorize`)
    expect(Object.fromEntries(authorize.searchParams)).toMatchObject({
      response_type: 'code',
      client_id: client.clientId,
      redirect_uri: `${origin}/api/auth/callback/github`,
      code_challenge_method: 'S256',
    })
    expect(authorize.searchParams.get('scope')?.split(' ')).toEqual(expect.arrayContaining(['openid', 'email', 'profile']))
    expect(authorize.searchParams.get('nonce')).toBeTruthy()
  })

  it('links a user by their verified address on the first sign-in, and signs them in by the link after that', async () => {
    const { auth, platformSignIn, accounts } = await serve()
    await createUser(auth, { email: 'octo@example.com', password, role: 'user' })

    const first = await platformSignIn(octo())
    expect(first.location).toBe(`${origin}/`)
    expect(first.session.user.email).toBe('octo@example.com')
    expect(await accounts()).toEqual([{ email: 'octo@example.com', providerId: 'github', accountId: '4242' }])

    // The provider now reports another address: the link, not the address, finds the person.
    const again = await platformSignIn(octo({ email: 'octo@work.example' }))
    expect(again.session.user.email).toBe('octo@example.com')
  })

  it('signs in a user linked to the id beforehand, whatever their address', async () => {
    const { auth, platformSignIn } = await serve()
    await createUser(auth, { email: 'sanne@example.com', password, role: 'user', accounts: [{ providerId: 'github', accountId: '4242' }] })
    const { session } = await platformSignIn(octo())
    expect(session.user.email).toBe('sanne@example.com')
  })

  it('signs nobody up', async () => {
    const { store, platformSignIn } = await serve()
    const { location, session } = await platformSignIn(octo())
    expect(location).toBe(`${origin}/?error=signup_disabled`)
    expect(session).toBeNull()
    expect((await store.query(`select 1 from "user" where email = 'octo@example.com'`)).rows).toHaveLength(0)
  })

  it('does not link by an address the provider has not verified', async () => {
    const { auth, platformSignIn, accounts } = await serve()
    await createUser(auth, { email: 'octo@example.com', password, role: 'user' })
    const { location, session } = await platformSignIn(octo({ email_verified: false }))
    expect(location).toBe(`${origin}/?error=account_not_linked`)
    expect(session).toBeNull()
    expect(await accounts()).toEqual([])
  })

  it('refuses an ID token for another sign-in, signed with a key the provider does not publish, or from another issuer', async () => {
    const { auth, platformSignIn, accounts } = await serve()
    await createUser(auth, { email: 'octo@example.com', password, role: 'user' })
    for (const twist of [{ nonce: 'another-sign-in' }, { foreignKey: true }, { issuer: 'https://evil.example' }]) {
      const { location, session } = await platformSignIn(octo(), twist)
      expect(location).toMatch(/[?&]error=/)
      expect(session).toBeNull()
    }
    expect(await accounts()).toEqual([])
  })

  it('refuses a provider whose discovery names another issuer than the configured one', async () => {
    const { auth, platformSignIn } = await serve({ discoveredIssuer: 'https://evil.example' })
    await createUser(auth, { email: 'octo@example.com', password, role: 'user' })
    const { location, session } = await platformSignIn(octo())
    expect(location).toMatch(/[?&]error=/)
    expect(session).toBeNull()
  })

  it("links a provider account with another address on purpose, from someone's own session", async () => {
    const { auth, request, signIn, platform, accounts } = await serve()
    await createUser(auth, { email: 'sanne@example.com', password, role: 'user' })
    const cookie = await signIn('sanne@example.com')
    const start = await request('/link-social', { cookie, body: { provider: 'github', callbackURL: `${origin}/account`, errorCallbackURL: `${origin}/account`, disableRedirect: true } })
    expect(start.status).toBe(200)
    const { code, state } = platform.approve(((await start.json()) as { url: string }).url, octo())
    const callback = await request(`/callback/github?code=${code}&state=${encodeURIComponent(state)}`, { cookie: [cookie, ...cookiesOf(start)].join('; ') })
    expect(callback.headers.get('location')).toBe(`${origin}/account`)
    expect(await accounts()).toEqual([{ email: 'sanne@example.com', providerId: 'github', accountId: '4242' }])
  })
})

describe('the policy for sign-in through the platform', () => {
  it('turns it off: no longer offered, starting it is refused', async () => {
    const { request, savePolicy } = await serve()
    await savePolicy({ platformSignIn: 'forbidden' })
    const status = await (await request('/status')).json()
    expect(status.socialProviders).toEqual([])
    expect(status).not.toHaveProperty('platformSignIn')
    const refused = await request('/sign-in/social', { body: { provider: 'github', callbackURL: `${origin}/`, disableRedirect: true } })
    expect(refused.status).toBe(403)
    expect(await refused.json()).toMatchObject({ code: 'SIGN_IN_METHOD_FORBIDDEN' })
  })

  it('applies as off while two-factor authentication is required, since the provider skips the second step', async () => {
    const { request, signIn, savePolicy } = await serve()
    await savePolicy({ twoFactor: 'required' })
    const answer = await (await request('/policy/sign-in', { cookie: await signIn('root@example.com') })).json()
    expect(answer).toMatchObject({ platformSignIn: 'GitHub', policy: { platformSignIn: 'allowed' }, effective: { platformSignIn: 'forbidden' } })
    expect((await (await request('/status')).json()).socialProviders).toEqual([])
    expect((await request('/sign-in/social', { body: { provider: 'github', callbackURL: `${origin}/`, disableRedirect: true } })).status).toBe(403)
  })
})

describe('without the platform provider', () => {
  it("is left out when the app has a GitHub provider of its own, which then signs in with GitHub's own app", async () => {
    const { request } = await serve({ socialProviders: { github: { clientId: 'Iv1.own', clientSecret: 'own-secret' } } })
    const status = await (await request('/status')).json()
    expect(status.socialProviders).toEqual(['github'])
    expect(status).not.toHaveProperty('platformSignIn')
    const start = await request('/sign-in/social', { body: { provider: 'github', callbackURL: `${origin}/`, disableRedirect: true } })
    const authorize = new URL(((await start.json()) as { url: string }).url)
    expect(authorize.origin + authorize.pathname).toBe('https://github.com/login/oauth/authorize')
    expect(authorize.searchParams.get('client_id')).toBe('Iv1.own')
  })

  it('is not offered when its settings could not be read at startup', async () => {
    const { request } = await serve({ signInProvider: { issuer: 'https://down.platform.example', ...client } })
    expect((await (await request('/status')).json()).socialProviders).toEqual([])
  })

  it('takes an id and a name of its own', async () => {
    const { request, auth, platformSignIn } = await serve({ provider: 'oidc', signInProvider: { issuer, ...client, provider: 'oidc', name: 'Acme SSO' } })
    expect(await (await request('/status')).json()).toMatchObject({ socialProviders: ['oidc'], platformSignIn: { provider: 'oidc', name: 'Acme SSO' } })
    await createUser(auth, { email: 'octo@example.com', password, role: 'user' })
    expect((await platformSignIn(octo())).session.user.email).toBe('octo@example.com')
  })
})
