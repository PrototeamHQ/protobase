import { PGlite } from '@electric-sql/pglite'
import { Kysely } from 'kysely'
import { PGliteDialect } from 'kysely-pglite-dialect'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { betterAuthAuthenticator } from '../src/better-auth/authenticator'
import { createAuth, type CreateAuthOptions } from '../src/better-auth/create-auth'
import { createUser } from '../src/better-auth/users'
import { createAdmin } from '../src/create-admin'
import { createAuthStore } from '../../../test-support/auth'

const origin = 'http://localhost:5173'
const secret = 'test-secret-test-secret-test-secret-1234'
const github = { github: { clientId: 'Iv1.client', clientSecret: 'client-secret' } }

// A mock GitHub: the token exchange and the two user endpoints Better Auth's GitHub provider calls.
const mockGitHub = () => {
  const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })
  const exchanged: string[] = []
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init)
    const url = new URL(request.url)
    if (url.href === 'https://github.com/login/oauth/access_token') {
      exchanged.push(new URLSearchParams(await request.text()).get('code') ?? '')
      return json({ access_token: 'gho_user', token_type: 'bearer', scope: 'read:user,user:email' })
    }
    if (request.headers.get('authorization') !== 'Bearer gho_user') return new Response('Bad credentials', { status: 401 })
    if (url.href === 'https://api.github.com/user') return json({ id: 4242, login: 'octo', name: 'Octo Cat', email: null, avatar_url: 'https://avatars.example/4242' })
    if (url.href === 'https://api.github.com/user/emails') return json([{ email: 'octo@example.com', primary: true, verified: true }])
    throw new Error(`Unexpected request to ${url.href}`)
  })
  return { exchanged }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

let shared: PGlite
let appDb: Kysely<any>
beforeAll(async () => {
  shared = await createAuthStore()
  appDb = new Kysely<any>({ dialect: new PGliteDialect(shared) })
})

// Better Auth's rate limits are per client address and kept in memory, so every app gets an address of its own.
let client = 0

const serve = async (options: Partial<CreateAuthOptions> = {}) => {
  const store = (await shared.clone()) as PGlite
  const auth = createAuth({ database: { dialect: new PGliteDialect(store), type: 'postgres' }, baseURL: origin, secret, mailer: false, ...options })
  await createUser(auth, { email: 'root@example.com', password: 'correct horse battery' })
  const app = createAdmin({ resources: [], db: appDb, authenticate: betterAuthAuthenticator({ auth }), auth })
  const address = `203.0.113.${++client}`
  return { auth, app, store, address }
}

const cookies = (response: Response) => response.headers.getSetCookie().map((line) => line.split(';')[0]).join('; ')

// The browser's round trip: ask for the authorization URL, "approve" at GitHub, and follow the callback.
const signInWithGitHub = async ({ app, address }: { app: ReturnType<typeof createAdmin>; address: string }) => {
  const start = await app.request(`${origin}/api/auth/sign-in/social`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin, 'x-forwarded-for': address },
    body: JSON.stringify({ provider: 'github', callbackURL: `${origin}/`, disableRedirect: true }),
  })
  expect(start.status).toBe(200)
  const authorize = new URL(((await start.json()) as { url: string }).url)
  expect(authorize.origin + authorize.pathname).toBe('https://github.com/login/oauth/authorize')
  expect(authorize.searchParams.get('redirect_uri')).toBe(`${origin}/api/auth/callback/github`)
  const state = authorize.searchParams.get('state') ?? ''
  return app.request(`${origin}/api/auth/callback/github?code=the-code&state=${encodeURIComponent(state)}`, { headers: { cookie: cookies(start), 'x-forwarded-for': address } })
}

describe('sign-in with GitHub', () => {
  it('is not offered without providers', async () => {
    const { app } = await serve()
    expect(await (await app.request(`${origin}/api/auth/status`)).json()).toEqual({ needsAdmin: false, passwordReset: false, socialProviders: [] })
    const start = await app.request(`${origin}/api/auth/sign-in/social`, { method: 'POST', headers: { 'content-type': 'application/json', origin }, body: JSON.stringify({ provider: 'github', callbackURL: `${origin}/` }) })
    expect(start.status).toBeGreaterThanOrEqual(400)
  })

  it('signs up a new GitHub user with the default role, and the session gets a token with it', async () => {
    const { exchanged } = mockGitHub()
    const served = await serve({ socialProviders: github })
    const { app, store } = served
    expect(((await (await app.request(`${origin}/api/auth/status`)).json()) as { socialProviders: string[] }).socialProviders).toEqual(['github'])

    const callback = await signInWithGitHub(served)
    expect(callback.status).toBe(302)
    expect(callback.headers.get('location')).toBe(`${origin}/`)
    expect(exchanged).toEqual(['the-code'])
    const users = await store.query<{ email: string; role: string; name: string }>(`select email, role, name from "user" where email = 'octo@example.com'`)
    expect(users.rows).toEqual([{ email: 'octo@example.com', role: 'user', name: 'Octo Cat' }])
    const accounts = await store.query<{ providerId: string; accountId: string }>(`select "providerId", "accountId" from account a join "user" u on u.id = a."userId" where u.email = 'octo@example.com'`)
    expect(accounts.rows).toEqual([{ providerId: 'github', accountId: '4242' }])

    const token = await app.request(`${origin}/api/auth/token`, { headers: { cookie: cookies(callback), origin } })
    const { token: jwt } = (await token.json()) as { token: string }
    expect(JSON.parse(atob(jwt.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/')))).toMatchObject({ email: 'octo@example.com', role: 'user' })
  })

  it('signs the same GitHub user in again without a second account', async () => {
    mockGitHub()
    const served = await serve({ socialProviders: github })
    await signInWithGitHub(served)
    expect((await signInWithGitHub(served)).headers.get('location')).toBe(`${origin}/`)
    expect((await served.store.query(`select 1 from "user" where email = 'octo@example.com'`)).rows).toHaveLength(1)
    expect((await served.store.query(`select 1 from account where "providerId" = 'github'`)).rows).toHaveLength(1)
  })

  it('runs the after-create hook for a GitHub sign-up and stores its tokens encrypted', async () => {
    mockGitHub()
    const created: { email: string; role: unknown }[] = []
    const served = await serve({ socialProviders: github, encryptOAuthTokens: true, onUserCreated: async (user) => void created.push({ email: user.email, role: user.role }) })
    await signInWithGitHub(served)
    expect(created).toEqual([{ email: 'root@example.com', role: 'admin' }, { email: 'octo@example.com', role: 'user' }])
    const accounts = await served.store.query<{ accessToken: string }>(`select "accessToken" from account where "providerId" = 'github'`)
    expect(accounts.rows).toHaveLength(1)
    expect(accounts.rows[0]!.accessToken).not.toContain('gho_user')
  })

  it('refuses the sign-up when the project has no default role', async () => {
    mockGitHub()
    const served = await serve({ socialProviders: github, roles: ['admin', 'sales', 'accountant'] })
    const callback = await signInWithGitHub(served)
    expect(callback.status).toBe(400)
    expect(await callback.text()).toContain('Choose a role for the new user')
    expect((await served.store.query(`select 1 from "user" where email = 'octo@example.com'`)).rows).toHaveLength(0)
  })
})
