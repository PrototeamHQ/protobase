import { Kysely } from 'kysely'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlatformSignIn } from '../src/better-auth/platform-sign-in'
import { createUser } from '../src/better-auth/users'
import { cookiesOf, octo, origin, password, type PlatformApp } from './support/platform-sign-in-app'
import { centralClient, serveTwoProviders, tokenClaims } from './support/two-platform-providers'
import { openSnapshotDb, type SnapshotDb } from '../../../test-support/sql-snapshot'

// More than one provider of the platform: each with its own id, issuer, keys and ways of signing in, as one more
// provider signs in alongside the first without changing it. Its providers of devices are in
// platform-device-accounts.test.ts.

let shared: SnapshotDb
let appDb: Kysely<any>
beforeAll(async () => {
  shared = await openSnapshotDb('auth')
  appDb = new Kysely<any>({ dialect: shared.dialect })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const { reset, claims } = tokenClaims()
beforeEach(reset)

const serve = (central: Partial<PlatformSignIn> = {}, options: PlatformApp = {}) => serveTwoProviders(shared, appDb, central, options)

describe("the platform's providers", () => {
  it('verify a token only against the provider it is posted for: its issuer and keys', async () => {
    const { auth, platform, central, postToken, accounts } = await serve()
    await createUser(auth, { email: 'octo@example.com', password, role: 'user' })
    const fromGithub = await platform.idToken(claims())
    const fromCentral = await central.idToken(claims())
    for (const [provider, token] of [['central', fromGithub], ['github', fromCentral]] as const) {
      const refused = await postToken(provider, token)
      expect(refused.status).toBe(401)
      expect(await refused.json()).toMatchObject({ code: 'INVALID_TOKEN' })
    }
    expect((await postToken('github', fromGithub)).status).toBe(200)
    expect((await postToken('central', fromCentral)).status).toBe(200)
    expect((await accounts()).map(({ providerId, accountId }) => `${providerId} ${accountId}`).sort()).toEqual(['central 4242', 'github 4242'])
  })

  it('offer a button only for those with pages, and send nobody through the pages of one that takes tokens alone', async () => {
    const { request } = await serve()
    expect(await (await request('/status')).json()).toMatchObject({ socialProviders: ['github'], platformProviders: [{ provider: 'github', name: 'GitHub' }], tokenProviders: ['github', 'central'] })
    const refused = await request('/sign-in/social', { body: { provider: 'central', callbackURL: `${origin}/` } })
    expect(refused.status).toBe(403)
    expect(await refused.json()).toMatchObject({ code: 'PROVIDER_PAGES_OFF' })
    expect((await request('/sign-in/social', { body: { provider: 'github', callbackURL: `${origin}/`, disableRedirect: true } })).status).toBe(200)
  })

  it('are all turned off by the policy for sign-in through the platform', async () => {
    const { auth, platform, central, request, savePolicy, postToken } = await serve()
    await createUser(auth, { email: 'octo@example.com', password, role: 'user' })
    await savePolicy({ platformSignIn: 'forbidden' })
    for (const [provider, token] of [['github', await platform.idToken(claims())], ['central', await central.idToken(claims())]] as const) {
      const refused = await postToken(provider, token)
      expect(refused.status).toBe(403)
      expect(await refused.json()).toMatchObject({ code: 'SIGN_IN_METHOD_FORBIDDEN' })
    }
    const status = await (await request('/status')).json()
    expect(status).not.toHaveProperty('platformProviders')
    expect(status).not.toHaveProperty('tokenProviders')
  })

  it('may show the same name, which is apart from the id', async () => {
    const { request } = await serve({ ...centralClient, name: 'GitHub', tokenSignIn: false })
    expect(await (await request('/status')).json()).toMatchObject({
      socialProviders: ['github', 'central'],
      platformProviders: [
        { provider: 'github', name: 'GitHub' },
        { provider: 'central', name: 'GitHub' },
      ],
      tokenProviders: ['github'],
    })
  })
})

describe('a provider without a button', () => {
  it('is offered for sign-in links but shows no button, and its link signs in through its pages', async () => {
    const { auth, request, platformSignIn } = await serve({}, { settings: { button: false } })
    expect(await (await request('/status')).json()).toMatchObject({ socialProviders: ['github'], platformProviders: [{ provider: 'github', name: 'GitHub', button: false }] })
    await createUser(auth, { email: 'octo@example.com', password, role: 'user' })
    // What a sign-in link (`?sign-in=github`) or another app's redirect starts.
    expect((await platformSignIn(octo())).session.user.email).toBe('octo@example.com')
  })

  it('leaves a provider of tokens alone refusing its pages', async () => {
    const { request } = await serve()
    const refused = await request('/sign-in/social', { body: { provider: 'central', callbackURL: `${origin}/` } })
    expect(refused.status).toBe(403)
    expect(await refused.json()).toMatchObject({ code: 'PROVIDER_PAGES_OFF' })
  })
})

describe('linking on a first sign-in', () => {
  it("links nobody whose own address is not verified, though the provider's is", async () => {
    const { auth, store, central, postToken, accounts } = await serve()
    await createUser(auth, { email: 'octo@example.com', password, role: 'user' })
    await store.query(`update "user" set email_verified = false where email = 'octo@example.com'`)
    const refused = await postToken('central', await central.idToken(claims()))
    expect(refused.status).toBeGreaterThanOrEqual(400)
    expect(cookiesOf(refused).filter((cookie) => cookie.includes('session_token='))).toEqual([])
    expect(await accounts()).toEqual([])
  })

  it('refuses another subject of a provider the person is linked to already, by the address', async () => {
    const { auth, central, postToken, accounts } = await serve()
    await createUser(auth, { email: 'octo@example.com', password, role: 'user', accounts: [{ providerId: 'central', accountId: '4242' }] })
    const refused = await postToken('central', await central.idToken(claims({ sub: '5151' })))
    expect(refused.status).toBe(403)
    expect(await refused.json()).toMatchObject({ code: 'PROVIDER_ACCOUNT_LINKED' })
    expect(await accounts()).toEqual([{ email: 'octo@example.com', providerId: 'central', accountId: '4242' }])
    expect((await postToken('central', await central.idToken(claims()))).status).toBe(200)
  })
})

describe('fixed authorization parameters', () => {
  it('go on every authorization request, and the client cannot change or add to them', async () => {
    const { auth, platform, request, signIn, platformSignIn } = await serve({}, { settings: { authorizationParams: { connection: 'github' } } })
    await createUser(auth, { email: 'octo@example.com', password, role: 'user' })
    const { url, session } = await platformSignIn(octo())
    expect(new URL(url).searchParams.get('connection')).toBe('github')
    expect(platform.authorizations.at(-1)!.searchParams.get('connection')).toBe('github')
    expect(session.user.email).toBe('octo@example.com')
    const cookie = await signIn('root@example.com')
    for (const [path, extra] of [['/sign-in/social', {}], ['/link-social', { cookie }]] as const) {
      const refused = await request(path, { body: { provider: 'github', callbackURL: `${origin}/`, additionalParams: { connection: 'other' } }, ...extra })
      expect(refused.status).toBe(400)
      expect(await refused.json()).toMatchObject({ code: 'AUTHORIZATION_PARAMS_FIXED' })
    }
  })
})

describe('a hidden provider', () => {
  it('signs in by its link, which the account page neither lists, nor connects, nor disconnects', async () => {
    const { auth, store, central, request, signIn, postToken, accounts } = await serve({ ...centralClient, hidden: true })
    expect((await (await request('/status')).json()).platformProviders).toEqual([
      { provider: 'github', name: 'GitHub' },
      { provider: 'central', name: 'Central', hidden: true },
    ])
    await createUser(auth, { email: 'octo@example.com', password, role: 'user' })
    const signedIn = await postToken('central', await central.idToken(claims()))
    expect(await signedIn.json()).toMatchObject({ user: { email: 'octo@example.com' } })
    expect(await accounts()).toEqual([{ email: 'octo@example.com', providerId: 'central', accountId: '4242' }])

    const cookie = await signIn('octo@example.com')
    const listed = (await (await request('/list-accounts', { cookie })).json()) as { providerId: string }[]
    expect(listed.map(({ providerId }) => providerId)).toEqual(['credential'])
    const [{ id: accountId }] = (await store.query<{ id: string }>(`select id from account where provider_id = 'central'`)).rows as [{ id: string }]
    for (const [path, body] of [['/unlink-account', { accountId }], ['/link-social', { provider: 'central', callbackURL: `${origin}/` }]] as const) {
      const refused = await request(path, { cookie, body })
      expect(refused.status).toBe(403)
      expect(await refused.json()).toMatchObject({ code: 'PROVIDER_ACCOUNT_HIDDEN' })
    }
    expect(await accounts()).toEqual([{ email: 'octo@example.com', providerId: 'central', accountId: '4242' }])
  })
})
