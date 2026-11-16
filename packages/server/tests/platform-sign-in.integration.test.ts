import { Kysely } from 'kysely'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createUser } from '../src/better-auth/users'
import { client, cookiesOf, issuer, octo, origin, password, servePlatformApp, type PlatformApp } from './support/platform-sign-in-app'
import { openSnapshotDb, type SnapshotDb } from '../../../test-support/sql-snapshot'

let shared: SnapshotDb
let appDb: Kysely<any>
beforeAll(async () => {
  shared = await openSnapshotDb('auth')
  appDb = new Kysely<any>({ dialect: shared.dialect })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const serve = (options: PlatformApp = {}) => servePlatformApp(shared, appDb, options)

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

describe('an ID token a client posts', () => {
  it("is refused for the platform's provider, a valid one too, and signs nobody in", async () => {
    const { auth, platform, request } = await serve()
    await createUser(auth, { email: 'octo@example.com', password, role: 'user' })
    const refused = await request('/sign-in/social', { body: { provider: 'github', idToken: { token: await platform.idToken(octo()) } } })
    expect(refused.status).toBe(403)
    expect(await refused.json()).toMatchObject({ code: 'TOKEN_SIGN_IN_OFF' })
    expect(cookiesOf(refused)).toEqual([])
  })

  it("is refused for the app's own provider, and for connecting a provider from someone's session", async () => {
    const { auth, platform, request, signIn, accounts } = await serve({ socialProviders: { google: { clientId: 'own-client', clientSecret: 'own-secret' } } })
    await createUser(auth, { email: 'sanne@example.com', password, role: 'user' })
    const own = await request('/sign-in/social', { body: { provider: 'google', idToken: { token: 'eyJhbGciOiJSUzI1NiJ9.e30.c2ln' } } })
    expect(own.status).toBe(403)
    expect(await own.json()).toMatchObject({ code: 'TOKEN_SIGN_IN_OFF' })
    const link = await request('/link-social', { cookie: await signIn('sanne@example.com'), body: { provider: 'github', idToken: { token: await platform.idToken(octo()) } } })
    expect(link.status).toBe(403)
    expect(await link.json()).toMatchObject({ code: 'TOKEN_SIGN_IN_OFF' })
    expect(await accounts()).toEqual([])
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
