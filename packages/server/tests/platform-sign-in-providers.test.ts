import { Kysely } from 'kysely'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlatformSignIn } from '../src/better-auth/platform-sign-in'
import { createUser } from '../src/better-auth/users'
import { startFakeOidcProvider } from './support/fake-oidc-provider'
import { authenticatorCode } from './support/vault-app'
import { client, cookiesOf, octo, origin, password, servePlatformApp, type PlatformApp } from './support/platform-sign-in-app'
import { openSnapshotDb, type SnapshotDb } from '../../../test-support/sql-snapshot'

// More than one provider of the platform: each with its own id, issuer, keys and ways of signing in, as one more
// provider signs in alongside the first without changing it.

let shared: SnapshotDb
let appDb: Kysely<any>
beforeAll(async () => {
  shared = await openSnapshotDb('auth')
  appDb = new Kysely<any>({ dialect: shared.dialect })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const centralIssuer = 'https://id.central.example'
const centralClient = { clientId: client.clientId, clientSecret: 'central-client-secret' }

// Each test's tokens get the same ids whatever ran before it.
let tokens = 0
beforeEach(() => {
  tokens = 0
})
const claims = (changes: Record<string, unknown> = {}) => octo({ jti: `token-${++tokens}`, ...changes })

// The platform's first provider, `github`, beside `central`, whose tokens are for the same audience, so only the
// issuer and keys tell them apart.
const serve = async (central: Partial<PlatformSignIn> = {}, options: PlatformApp = {}) => {
  const second = await startFakeOidcProvider({ issuer: centralIssuer, client: centralClient })
  const app = await servePlatformApp(shared, appDb, { tokenSignIn: true, more: [{ issuer: centralIssuer, clientId: centralClient.clientId, provider: 'central', name: 'Central', tokenSignIn: true, ...central }], ...options })
  const postToken = (provider: string, token: string, cookie?: string) => app.request('/sign-in/social', { body: { provider, idToken: { token } }, ...(cookie && { cookie }) })
  return { ...app, central: second, postToken }
}

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
    expect(await (await request('/status')).json()).toMatchObject({ socialProviders: ['github'], platformProviders: [{ provider: 'github', name: 'GitHub' }] })
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
    expect(await (await request('/status')).json()).not.toHaveProperty('platformProviders')
  })

  it('may show the same name, which is apart from the id', async () => {
    const { request } = await serve({ ...centralClient, name: 'GitHub', tokenSignIn: false })
    expect(await (await request('/status')).json()).toMatchObject({
      socialProviders: ['github', 'central'],
      platformProviders: [
        { provider: 'github', name: 'GitHub' },
        { provider: 'central', name: 'GitHub' },
      ],
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

describe('a provider of devices', () => {
  type Links = { links: { id: string; provider: string; name: string; device?: string; sessions: string[] }[] }
  const sessionToken = (cookie: string) => decodeURIComponent(/session_token=([^;.]+)/.exec(cookie)![1]!)

  it('links each device of one person by the address, and signs each in', async () => {
    const { auth, central, request, signIn, postToken, accounts } = await serve({ devices: true })
    await createUser(auth, { email: 'octo@example.com', password, role: 'user' })
    for (const device of ['device-1', 'device-2']) expect((await postToken('central', await central.idToken(claims({ sub: device })))).status).toBe(200)
    expect((await accounts()).map(({ accountId }) => accountId).sort()).toEqual(['device-1', 'device-2'])
    const listed = (await (await request('/list-accounts', { cookie: await signIn('octo@example.com') })).json()) as { providerId: string }[]
    expect(listed.map(({ providerId }) => providerId)).toEqual(['credential'])
  })

  it('signs one device out for good, its sessions with it, and leaves the others signed in', async () => {
    const { auth, central, request, signIn, postToken, accounts } = await serve({ devices: true })
    await createUser(auth, { email: 'octo@example.com', password, role: 'user' })
    const phone = cookiesOf(await postToken('central', await central.idToken(claims({ sub: 'device-1', device_name: "Octo's phone" })))).join('; ')
    const tablet = cookiesOf(await postToken('central', await central.idToken(claims({ sub: 'device-2' })))).join('; ')
    const cookie = await signIn('octo@example.com')
    const { links } = (await (await request('/account/device-links', { cookie })).json()) as Links
    const byDevice = new Map(links.map((link) => [link.device ?? link.id, link]))
    expect(byDevice.get("Octo's phone")).toMatchObject({ provider: 'central', name: 'Central', sessions: [sessionToken(phone)] })
    expect(links).toHaveLength(2)

    const signedOut = await request('/account/device-links/sign-out', { cookie, body: { id: byDevice.get("Octo's phone")!.id } })
    expect(signedOut.status).toBe(200)
    expect(await (await request('/get-session', { cookie: phone })).json()).toBeNull()
    expect((await (await request('/get-session', { cookie: tablet })).json()).user.email).toBe('octo@example.com')
    expect((await accounts()).map(({ accountId }) => accountId)).toEqual(['device-2'])

    const again = await postToken('central', await central.idToken(claims({ sub: 'device-1' })))
    expect(again.status).toBe(403)
    expect(await again.json()).toMatchObject({ code: 'DEVICE_SIGNED_OUT' })
    expect((await accounts()).map(({ accountId }) => accountId)).toEqual(['device-2'])
    // A new device of the same verified address links as the first ones did.
    expect((await postToken('central', await central.idToken(claims({ sub: 'device-3' })))).status).toBe(200)
    expect((await accounts()).map(({ accountId }) => accountId).sort()).toEqual(['device-2', 'device-3'])
  })

  it('notes a device sign-in that waits for the second step as the device, once the step is taken', async () => {
    const { auth, central, request, signIn, postToken } = await serve({ devices: true })
    await createUser(auth, { email: 'octo@example.com', password, role: 'user' })
    const first = await signIn('octo@example.com')
    const { totpURI } = (await (await request('/two-factor/enable', { cookie: first, body: { password } })).json()) as { totpURI: string }
    const enabled = await request('/two-factor/verify-totp', { cookie: first, body: { code: authenticatorCode(totpURI) } })
    expect(enabled.status).toBe(200)
    // Turning it on starts a session of its own in place of the first.
    const cookie = cookiesOf(enabled).join('; ')

    const challenged = await postToken('central', await central.idToken(claims({ sub: 'device-1' })))
    expect(await challenged.json()).toMatchObject({ twoFactorRedirect: true })
    const verified = await request('/two-factor/verify-totp', { cookie: cookiesOf(challenged).join('; '), body: { code: authenticatorCode(totpURI) } })
    expect(verified.status).toBe(200)
    const phone = cookiesOf(verified).join('; ')
    const { links } = (await (await request('/account/device-links', { cookie })).json()) as Links
    expect(links).toMatchObject([{ sessions: [sessionToken(phone)] }])

    expect((await request('/account/device-links/sign-out', { cookie, body: { id: links[0]!.id } })).status).toBe(200)
    expect(await (await request('/get-session', { cookie: phone })).json()).toBeNull()
  })

  it('takes a sign-out that stopped half way again, and finishes it', async () => {
    const { auth, store, central, request, signIn, postToken, accounts } = await serve({ devices: true })
    await createUser(auth, { email: 'octo@example.com', password, role: 'user' })
    const phone = cookiesOf(await postToken('central', await central.idToken(claims({ sub: 'device-1' })))).join('; ')
    const cookie = await signIn('octo@example.com')
    const { links } = (await (await request('/account/device-links', { cookie })).json()) as Links
    // The device is refused already, as a sign-out that failed after its first step left it.
    await store.query(`insert into refused_account (id, provider_id, account_id, user_id, created_at) select 'refused-1', 'central', 'device-1', user_id, now() from account where provider_id = 'central'`)
    expect((await request('/account/device-links/sign-out', { cookie, body: { id: links[0]!.id } })).status).toBe(200)
    expect(await (await request('/get-session', { cookie: phone })).json()).toBeNull()
    expect(await accounts()).toEqual([])
  })

  it("cannot sign out another person's device", async () => {
    const { auth, central, request, signIn, postToken } = await serve({ devices: true })
    await createUser(auth, { email: 'octo@example.com', password, role: 'user' })
    await createUser(auth, { email: 'sanne@example.com', password, role: 'user' })
    await postToken('central', await central.idToken(claims({ sub: 'device-1' })))
    const { links } = (await (await request('/account/device-links', { cookie: await signIn('octo@example.com') })).json()) as Links
    const refused = await request('/account/device-links/sign-out', { cookie: await signIn('sanne@example.com'), body: { id: links[0]!.id } })
    expect(refused.status).toBe(404)
  })
})
