import { Kysely } from 'kysely'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createUser } from '../src/better-auth/users'
import { turnOnAuthenticatorApp } from './support/authenticator-app'
import { cookiesOf, octo, origin, password, servePlatformApp, type PlatformApp } from './support/platform-sign-in-app'
import { authenticatorCode } from './support/vault-app'
import { openSnapshotDb, type SnapshotDb } from '../../../test-support/sql-snapshot'

// A provider's sign-in through its pages is one factor, as an emailed code is: the app asks for its own second step.

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

describe("the second step after a provider's sign-in", () => {
  it('sends a person who turned it on back to the page they came from to take it, and signs them in once it is right', async () => {
    const { auth, request, signIn, platformSignIn } = await serve()
    await createUser(auth, { email: 'octo@example.com', password, role: 'user' })
    const totpURI = await turnOnAuthenticatorApp(request, await signIn('octo@example.com'), password)

    const { callback, session, location } = await platformSignIn(octo())
    expect(location).toBe(`${origin}/?second-step=totp`)
    expect(session).toBeNull()
    const pending = cookiesOf(callback).join('; ')
    expect(pending).not.toMatch(/session_token=[^;\s]/)
    expect((await request('/token', { cookie: pending })).status).toBe(401)
    expect((await request('/two-factor/verify-totp', { cookie: pending, body: { code: '000000' } })).status).toBe(401)
    const verified = await request('/two-factor/verify-totp', { cookie: pending, body: { code: authenticatorCode(totpURI) } })
    expect(verified.status).toBe(200)
    expect((await request('/token', { cookie: cookiesOf(verified).join('; ') })).status).toBe(200)
  })

  it('signs in a person without it at once, as before', async () => {
    const { auth, platformSignIn } = await serve()
    await createUser(auth, { email: 'octo@example.com', password, role: 'user' })
    const { session, location } = await platformSignIn(octo())
    expect(location).toBe(`${origin}/`)
    expect(session.user.email).toBe('octo@example.com')
  })

  it("keeps the provider's sign-in on while two-factor authentication is required, which the person then sets up", async () => {
    const { auth, request, signIn, savePolicy, platformSignIn } = await serve()
    await savePolicy({ twoFactor: 'required' })
    const answer = await (await request('/policy/sign-in', { cookie: await signIn('root@example.com') })).json()
    expect(answer).toMatchObject({ effective: { platformSignIn: 'allowed' } })
    expect((await (await request('/status')).json()).socialProviders).toEqual(['github'])
    await createUser(auth, { email: 'octo@example.com', password, role: 'user' })
    const { callback, session } = await platformSignIn(octo())
    expect(session.user.email).toBe('octo@example.com')
    const token = await request('/token', { cookie: cookiesOf(callback).join('; ') })
    expect(token.status).toBe(403)
    expect(await token.json()).toMatchObject({ code: 'SIGN_IN_SETUP_REQUIRED' })
  })

  it("turns the provider's sign-in off while passkeys are required", async () => {
    const { request, signIn, savePolicy } = await serve()
    await savePolicy({ passkey: 'required' })
    const answer = await (await request('/policy/sign-in', { cookie: await signIn('root@example.com') })).json()
    expect(answer).toMatchObject({ effective: { platformSignIn: 'forbidden' } })
    expect((await request('/sign-in/social', { body: { provider: 'github', callbackURL: `${origin}/`, disableRedirect: true } })).status).toBe(403)
  })
})
