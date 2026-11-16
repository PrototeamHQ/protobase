import { Kysely } from 'kysely'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createUser } from '../src/better-auth/users'
import { cookiesOf, octo, password, servePlatformApp, type PlatformApp } from './support/platform-sign-in-app'
import { authenticatorCode } from './support/vault-app'
import { openSnapshotDb, type SnapshotDb } from '../../../test-support/sql-snapshot'

// Token sign-in: a client that holds a fresh ID token the platform's provider issued for this app posts it, and gets
// the app's own session, as an emailed code would give it.

let shared: SnapshotDb
let appDb: Kysely<any>
beforeAll(async () => {
  shared = await openSnapshotDb('auth')
  appDb = new Kysely<any>({ dialect: shared.dialect })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// Every token has an id of its own, so each signs in once.
let tokens = 0
const claims = (changes: Record<string, unknown> = {}) => octo({ jti: `token-${++tokens}`, ...changes })

// The same token with the last character of its signature changed in bits base64url leaves unused: other text, the
// same signed claims, which still verify.
const base64url = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
const respelled = (token: string) => token.slice(0, -1) + base64url[base64url.indexOf(token.at(-1)!) ^ 1]

const serve = async (options: PlatformApp = {}) => {
  const app = await servePlatformApp(shared, appDb, { tokenSignIn: true, ...options })
  const postToken = (token: string) => app.request('/sign-in/social', { body: { provider: 'github', idToken: { token } } })
  const tokenSignIn = async (changes?: Record<string, unknown>) => postToken(await app.platform.idToken(claims(changes)))
  return { ...app, postToken, tokenSignIn }
}

describe('token sign-in through the platform provider', () => {
  it("signs in a person with an account by their verified address, with the app's own session and API token", async () => {
    const { auth, request, tokenSignIn, accounts } = await serve()
    await createUser(auth, { email: 'octo@example.com', password, role: 'user' })
    const signedIn = await tokenSignIn()
    expect(signedIn.status).toBe(200)
    expect(await signedIn.json()).toMatchObject({ redirect: false, user: { email: 'octo@example.com' } })
    const cookie = cookiesOf(signedIn).join('; ')
    expect((await (await request('/get-session', { cookie })).json()).user.email).toBe('octo@example.com')
    expect((await request('/token', { cookie })).status).toBe(200)
    expect(await accounts()).toEqual([{ email: 'octo@example.com', providerId: 'github', accountId: '4242' }])
  })

  it('signs in by the link once linked, whatever address the token carries', async () => {
    const { auth, tokenSignIn } = await serve()
    await createUser(auth, { email: 'sanne@example.com', password, role: 'user', accounts: [{ providerId: 'github', accountId: '4242' }] })
    const signedIn = await tokenSignIn({ email: 'octo@work.example', email_verified: false })
    expect(await signedIn.json()).toMatchObject({ user: { email: 'sanne@example.com' } })
  })

  it('signs a token in once', async () => {
    const { auth, platform, postToken } = await serve()
    await createUser(auth, { email: 'octo@example.com', password, role: 'user' })
    const token = await platform.idToken(claims())
    expect((await postToken(token)).status).toBe(200)
    const replayed = await postToken(token)
    expect(replayed.status).toBe(401)
    expect(await replayed.json()).toMatchObject({ code: 'TOKEN_USED' })
    expect(cookiesOf(replayed)).toEqual([])
  })

  it('signs a token without a jti in once, and the same token spelled another way is no new token', async () => {
    const { auth, platform, postToken } = await serve()
    await createUser(auth, { email: 'octo@example.com', password, role: 'user' })
    const token = await platform.idToken(octo())
    expect((await postToken(token)).status).toBe(200)
    for (const replayed of [token, respelled(token)]) {
      const answer = await postToken(replayed)
      expect(answer.status).toBe(401)
      expect(await answer.json()).toMatchObject({ code: 'TOKEN_USED' })
    }
  })

  it('refuses a token for another app, for this app among others, living over five minutes, or signed by another', async () => {
    const { auth, platform, postToken } = await serve()
    await createUser(auth, { email: 'octo@example.com', password, role: 'user' })
    const refused = [
      await platform.idToken(claims(), { audience: 'other.example.com' }),
      await platform.idToken(claims(), { audience: ['localhost', 'other.example.com'] }),
      await platform.idToken(claims(), { lifetime: '10m' }),
      await platform.idToken(claims(), { foreignKey: true }),
      await platform.idToken(claims(), { issuer: 'https://evil.example' }),
    ]
    for (const token of refused) {
      const answer = await postToken(token)
      expect(answer.status).toBe(401)
      expect(await answer.json()).toMatchObject({ code: 'INVALID_TOKEN' })
    }
  })

  it('signs nobody up, and links no address the provider has not verified', async () => {
    const { auth, store, tokenSignIn, accounts } = await serve()
    const nobody = await tokenSignIn()
    expect(nobody.status).toBe(401)
    expect(cookiesOf(nobody)).toEqual([])
    expect((await store.query(`select 1 from "user" where email = 'octo@example.com'`)).rows).toHaveLength(0)
    await createUser(auth, { email: 'octo@example.com', password, role: 'user' })
    const unverified = await tokenSignIn({ email_verified: false })
    expect(unverified.status).toBeGreaterThanOrEqual(400)
    expect(cookiesOf(unverified)).toEqual([])
    expect(await accounts()).toEqual([])
  })

  it('refuses a banned person', async () => {
    const { auth, store, tokenSignIn } = await serve()
    await createUser(auth, { email: 'octo@example.com', password, role: 'user' })
    await store.query(`update "user" set banned = true where email = 'octo@example.com'`)
    const refused = await tokenSignIn()
    expect(refused.status).toBe(403)
    expect(cookiesOf(refused).filter((cookie) => cookie.includes('session_token='))).toEqual([])
  })

  it('asks for the second step of a person who turned it on, as after a password', async () => {
    const { auth, request, signIn, tokenSignIn } = await serve()
    await createUser(auth, { email: 'octo@example.com', password, role: 'user' })
    const cookie = await signIn('octo@example.com')
    const { totpURI } = (await (await request('/two-factor/enable', { cookie, body: { password } })).json()) as { totpURI: string }
    expect((await request('/two-factor/verify-totp', { cookie, body: { code: authenticatorCode(totpURI) } })).status).toBe(200)

    const challenged = await tokenSignIn()
    expect(challenged.status).toBe(200)
    expect(await challenged.json()).toMatchObject({ twoFactorRedirect: true })
    const pending = cookiesOf(challenged).join('; ')
    // The session the token began ends, and its cookie with it.
    expect(pending).not.toMatch(/session_token=[^;\s]/)
    expect((await request('/token', { cookie: pending })).status).toBe(401)
    const verified = await request('/two-factor/verify-totp', { cookie: pending, body: { code: authenticatorCode(totpURI) } })
    expect(verified.status).toBe(200)
    expect((await request('/token', { cookie: cookiesOf(verified).join('; ') })).status).toBe(200)
  })

  it('never counts as recently signed in: an account change asks to confirm it is them first', async () => {
    const { auth, store, request, signIn, tokenSignIn } = await serve()
    await createUser(auth, { email: 'octo@example.com', password, role: 'user', accounts: [{ providerId: 'github', accountId: '4242' }] })
    const [{ id: accountId }] = (await store.query<{ id: string }>(`select id from account where provider_id = 'github'`)).rows as [{ id: string }]
    const token = cookiesOf(await tokenSignIn()).join('; ')
    const refused = await request('/unlink-account', { cookie: token, body: { accountId } })
    expect(refused.status).toBe(403)
    expect(await refused.json()).toMatchObject({ code: 'STRONG_SIGN_IN_REQUIRED' })
    // A password sign-in of the same age is recent.
    const unlinked = await request('/unlink-account', { cookie: await signIn('octo@example.com'), body: { accountId } })
    expect(unlinked.status).toBe(200)
  })

  it('still refuses linking with a token from a session', async () => {
    const { auth, platform, request, signIn } = await serve()
    await createUser(auth, { email: 'sanne@example.com', password, role: 'user' })
    const link = await request('/link-social', { cookie: await signIn('sanne@example.com'), body: { provider: 'github', idToken: { token: await platform.idToken(claims()) } } })
    expect(link.status).toBe(403)
    expect(await link.json()).toMatchObject({ code: 'TOKEN_SIGN_IN_OFF' })
  })
})

describe('the policy for token sign-in', () => {
  it('is the policy for sign-in through the platform: turned off, a token is refused before it is used', async () => {
    const { auth, store, savePolicy, tokenSignIn } = await serve()
    await createUser(auth, { email: 'octo@example.com', password, role: 'user' })
    await savePolicy({ platformSignIn: 'forbidden' })
    const refused = await tokenSignIn()
    expect(refused.status).toBe(403)
    expect(await refused.json()).toMatchObject({ code: 'SIGN_IN_METHOD_FORBIDDEN' })
    expect((await store.query(`select 1 from verification where identifier like 'protobase-sign-in-token-%'`)).rows).toHaveLength(0)
  })

  it('is off while passkeys are required', async () => {
    const { auth, savePolicy, tokenSignIn } = await serve()
    await createUser(auth, { email: 'octo@example.com', password, role: 'user' })
    await savePolicy({ passkey: 'required' })
    expect((await tokenSignIn()).status).toBe(403)
  })
})

describe('without token sign-in', () => {
  it('refuses a valid token for the platform provider, which is the default', async () => {
    const { auth, tokenSignIn } = await serve({ tokenSignIn: false })
    await createUser(auth, { email: 'octo@example.com', password, role: 'user' })
    const refused = await tokenSignIn()
    expect(refused.status).toBe(403)
    expect(await refused.json()).toMatchObject({ code: 'TOKEN_SIGN_IN_OFF' })
  })
})
