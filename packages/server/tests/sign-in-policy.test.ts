import { Kysely } from 'kysely'
import { beforeAll, describe, expect, it } from 'vitest'
import { betterAuthAuthenticator } from '../src/better-auth/authenticator'
import { createAuth, type CreateAuthOptions } from '../src/better-auth/create-auth'
import { defaultSignInPolicy } from '../src/better-auth/sign-in-policy'
import { createUser } from '../src/better-auth/users'
import { createAdmin } from '../src/create-admin'
import type { MailMessage } from '../src/mail/smtp-mailer'
import { openSnapshotDb, type SnapshotDb } from '../../../test-support/sql-snapshot'

const origin = 'http://localhost:5173'
const secret = 'test-secret-test-secret-test-secret-1234'
const password = 'correct horse battery'

let shared: SnapshotDb
let appDb: Kysely<any>
beforeAll(async () => {
  shared = await openSnapshotDb('auth')
  appDb = new Kysely<any>({ dialect: shared.dialect })
})

// Better Auth's rate limits are per client address and kept in memory, so every app gets an address of its own.
let client = 0

// Every app gets a copy of the migrated store, with an admin and a user, and keeps the mail it sends.
const serve = async (options: Partial<CreateAuthOptions> = {}) => {
  const store = await shared.clone()
  const sent: MailMessage[] = []
  const auth = createAuth({ database: { dialect: store.dialect, type: 'postgres' }, baseURL: origin, secret, mailer: { send: async (message) => void sent.push(message) }, ...options })
  await createUser(auth, { email: 'root@example.com', password })
  await createUser(auth, { email: 'sanne@example.com', password, role: 'user' })
  const app = createAdmin({ resources: [], db: appDb, authenticate: betterAuthAuthenticator({ auth }), auth })
  const address = `203.0.113.${++client}`
  const request = (path: string, init: { body?: unknown; cookie?: string } = {}) =>
    app.request(`${origin}/api/auth${path}`, {
      method: init.body === undefined ? 'GET' : 'POST',
      headers: { 'content-type': 'application/json', origin, 'x-forwarded-for': address, ...(init.cookie && { cookie: init.cookie }) },
      ...(init.body !== undefined && { body: JSON.stringify(init.body) }),
    })
  const signIn = async (email: string) => {
    const response = await request('/sign-in/email', { body: { email, password } })
    expect(response.status).toBe(200)
    return response.headers.getSetCookie().map((line) => line.split(';')[0]).join('; ')
  }
  const signInByCode = async (email: string) => {
    const before = sent.length
    expect((await request('/email-otp/send-verification-otp', { body: { email, type: 'sign-in' } })).status).toBe(200)
    await expect.poll(() => sent.length, { timeout: 10_000 }).toBe(before + 1)
    const otp = /^\d{6}$/m.exec(sent[before]!.text)?.[0]
    const response = await request('/sign-in/email-otp', { body: { email, otp } })
    expect(response.status).toBe(200)
    return response.headers.getSetCookie().map((line) => line.split(';')[0]).join('; ')
  }
  const status = async () => (await request('/status')).json()
  return { auth, store, sent, request, signIn, signInByCode, status }
}

describe('the sign-in policy endpoints', () => {
  it('answer admins only, with the default policy until one is saved', async () => {
    const { request, signIn } = await serve()
    expect((await request('/policy/sign-in')).status).toBe(401)
    const user = await signIn('sanne@example.com')
    expect(await (await request('/policy/sign-in', { cookie: user })).json()).toMatchObject({ code: 'ADMIN_ONLY' })
    expect((await request('/policy/sign-in', { cookie: user, body: defaultSignInPolicy })).status).toBe(403)
    const root = await signIn('root@example.com')
    expect(await (await request('/policy/sign-in', { cookie: root })).json()).toEqual({ policy: defaultSignInPolicy, effective: defaultSignInPolicy, mail: true })
  })

  it('save a policy, with who saved it and when, and refuse one that is invalid or locks people out', async () => {
    const { request, signIn } = await serve()
    const root = await signIn('root@example.com')
    const invalid = await request('/policy/sign-in', { cookie: root, body: { ...defaultSignInPolicy, password: 'required' } })
    expect(invalid.status).toBe(400)
    expect(await invalid.json()).toMatchObject({ code: 'INVALID_SIGN_IN_POLICY' })
    const lockout = await request('/policy/sign-in', { cookie: root, body: { ...defaultSignInPolicy, password: 'forbidden', emailCode: 'forbidden' } })
    expect(lockout.status).toBe(400)
    expect(await lockout.json()).toMatchObject({ code: 'SIGN_IN_POLICY_REFUSED', message: expect.stringContaining('Keep password or emailed-code sign-in on') })

    const strict = { ...defaultSignInPolicy, passkey: 'required', twoFactor: 'required' }
    const saved = await request('/policy/sign-in', { cookie: root, body: strict })
    expect(saved.status).toBe(200)
    const answer = await saved.json()
    // Sign-in through the platform skips the second step, so it applies as off while one is required.
    expect(answer).toMatchObject({ policy: strict, effective: { ...strict, platformSignIn: 'forbidden' }, mail: true, savedBy: 'root@example.com' })
    expect(Date.parse(answer.savedAt)).toBeGreaterThan(Date.now() - 60_000)
    expect(await (await request('/policy/sign-in', { cookie: root })).json()).toEqual(answer)
  })
})

describe('the app\'s default policy', () => {
  it('applies until an admin saves one, and again when the saved one no longer reads', async () => {
    const appDefault = { ...defaultSignInPolicy, password: 'forbidden' }
    const { store, request, signInByCode, status } = await serve({ signInPolicy: { password: 'forbidden' } })
    expect(await status()).toMatchObject({ signInMethods: ['emailCode', 'passkey'], passwordReset: false })
    expect((await request('/sign-in/email', { body: { email: 'sanne@example.com', password } })).status).toBe(403)
    const root = await signInByCode('root@example.com')
    expect(await (await request('/policy/sign-in', { cookie: root })).json()).toEqual({ policy: appDefault, effective: appDefault, mail: true })

    expect((await request('/policy/sign-in', { cookie: root, body: defaultSignInPolicy })).status).toBe(200)
    expect(await status()).toMatchObject({ signInMethods: ['password', 'emailCode', 'passkey'] })
    await store.query(`update sign_in_policy set password = 'sometimes'`)
    expect(await status()).toMatchObject({ signInMethods: ['emailCode', 'passkey'] })
  })
})

describe('an account without a password', () => {
  it('signs in by emailed code only', async () => {
    const { auth, request, signInByCode } = await serve()
    await createUser(auth, { email: 'noor@example.com', role: 'user' })
    expect((await request('/sign-in/email', { body: { email: 'noor@example.com', password } })).status).toBe(401)
    const cookie = await signInByCode('noor@example.com')
    expect(await (await request('/account/sign-in-methods', { cookie })).json()).toMatchObject({ account: { password: false, passkeys: 0 } })
  })
})

describe('a way to sign in the policy turns off', () => {
  it('is refused by the server and left out of the status', async () => {
    const { request, signIn, status } = await serve()
    await request('/policy/sign-in', { cookie: await signIn('root@example.com'), body: { ...defaultSignInPolicy, password: 'forbidden' } })
    const refused = await request('/sign-in/email', { body: { email: 'sanne@example.com', password } })
    expect(refused.status).toBe(403)
    expect(await refused.json()).toMatchObject({ code: 'SIGN_IN_METHOD_FORBIDDEN', message: 'Signing in with a password is turned off.' })
    expect((await request('/request-password-reset', { body: { email: 'sanne@example.com', redirectTo: `${origin}/` } })).status).toBe(403)
    expect(await status()).toEqual({ needsAdmin: false, signInMethods: ['emailCode', 'passkey'], passwordReset: false, socialProviders: [] })
  })

  it('comes back for passwords when mail goes away, so emailed codes are not the only way left', async () => {
    const { auth, store, request, signIn } = await serve()
    await request('/policy/sign-in', { cookie: await signIn('root@example.com'), body: { ...defaultSignInPolicy, password: 'forbidden' } })
    const withoutMail = createAuth({ database: { dialect: store.dialect, type: 'postgres' }, baseURL: origin, secret, mailer: false })
    const app = createAdmin({ resources: [], db: appDb, authenticate: betterAuthAuthenticator({ auth: withoutMail }), auth: withoutMail })
    expect(await (await app.request(`${origin}/api/auth/status`)).json()).toMatchObject({ signInMethods: ['password', 'passkey'] })
    const signedIn = await app.request(`${origin}/api/auth/sign-in/email`, { method: 'POST', headers: { 'content-type': 'application/json', origin }, body: JSON.stringify({ email: 'sanne@example.com', password }) })
    expect(signedIn.status).toBe(200)
    expect(auth.mail).toBe(true)
  })

  it('refuses emailed sign-in codes, and mails nothing', async () => {
    const { request, signIn, sent } = await serve()
    await request('/policy/sign-in', { cookie: await signIn('root@example.com'), body: { ...defaultSignInPolicy, emailCode: 'forbidden' } })
    expect((await request('/email-otp/send-verification-otp', { body: { email: 'sanne@example.com', type: 'sign-in' } })).status).toBe(403)
    expect((await request('/sign-in/email-otp', { body: { email: 'sanne@example.com', otp: '123456' } })).status).toBe(403)
    expect(sent).toEqual([])
  })
})

describe('emailed codes', () => {
  it('are for signing in only: the plugin\'s other flows are off', async () => {
    const { request, sent } = await serve()
    const other = await request('/email-otp/send-verification-otp', { body: { email: 'sanne@example.com', type: 'forget-password' } })
    expect(other.status).toBe(400)
    expect(await other.json()).toMatchObject({ code: 'SIGN_IN_CODES_ONLY' })
    for (const path of ['/email-otp/reset-password', '/email-otp/verify-email', '/forget-password/email-otp', '/email-otp/request-password-reset']) {
      expect((await request(path, { body: { email: 'sanne@example.com' } })).status).toBe(404)
    }
    expect(sent).toEqual([])
  })

  it('sign in to an account created before accounts were verified, and leave its password alone', async () => {
    const { auth, store, request, sent } = await serve()
    // Accounts created by an admin or on the host are verified; one from an older release was not.
    expect((await store.query<{ emailVerified: boolean }>(`select email_verified as "emailVerified" from "user" where email = 'sanne@example.com'`)).rows).toEqual([{ emailVerified: true }])
    await store.query(`update "user" set email_verified = false where email = 'sanne@example.com'`)
    expect((await request('/email-otp/send-verification-otp', { body: { email: 'sanne@example.com', type: 'sign-in' } })).status).toBe(200)
    await expect.poll(() => sent.length, { timeout: 10_000 }).toBe(1)
    const code = /^\d{6}$/m.exec(sent[0]!.text)?.[0]
    expect(sent[0]).toMatchObject({ to: 'sanne@example.com', subject: 'Your Protobase sign-in code' })
    expect((await request('/sign-in/email-otp', { body: { email: 'sanne@example.com', otp: code } })).status).toBe(200)
    expect((await request('/sign-in/email', { body: { email: 'sanne@example.com', password } })).status).toBe(200)
    expect(auth.mail).toBe(true)
  })
})

describe('a required method', () => {
  it('holds back API tokens until two-factor authentication is on, and then cannot be turned off', async () => {
    const { request, signIn } = await serve()
    await request('/policy/sign-in', { cookie: await signIn('root@example.com'), body: { ...defaultSignInPolicy, twoFactor: 'required' } })
    const cookie = await signIn('sanne@example.com')
    const held = await request('/token', { cookie })
    expect(held.status).toBe(403)
    expect(await held.json()).toMatchObject({ code: 'SIGN_IN_SETUP_REQUIRED' })
    expect(await (await request('/account/sign-in-methods', { cookie })).json()).toEqual({
      policy: { ...defaultSignInPolicy, twoFactor: 'required', platformSignIn: 'forbidden' },
      mail: true,
      account: { password: true, passkeys: 0, twoFactor: false, authenticatorApp: false },
      missing: ['twoFactor'],
    })

    const enabled = await request('/two-factor/enable', { cookie, body: { password, method: 'otp' } })
    expect(enabled.status).toBe(200)
    // Turning it on replaces the session.
    const fresh = enabled.headers.getSetCookie().map((line) => line.split(';')[0]).join('; ')
    expect((await request('/token', { cookie: fresh })).status).toBe(200)
    expect(await (await request('/account/sign-in-methods', { cookie: fresh })).json()).toMatchObject({ account: { twoFactor: true, authenticatorApp: false }, missing: [] })
    const disabled = await request('/two-factor/disable', { cookie: fresh, body: { password } })
    expect(disabled.status).toBe(403)
    expect(await disabled.json()).toMatchObject({ code: 'TWO_FACTOR_REQUIRED' })
  })

  it('holds back API tokens until there is a passkey, and keeps the last one', async () => {
    const { auth, request, signIn } = await serve()
    await request('/policy/sign-in', { cookie: await signIn('root@example.com'), body: { ...defaultSignInPolicy, passkey: 'required' } })
    const cookie = await signIn('sanne@example.com')
    expect(await (await request('/token', { cookie })).json()).toMatchObject({ code: 'SIGN_IN_SETUP_REQUIRED' })

    // Registering needs a browser's authenticator; the row it would store stands in for it.
    const { adapter } = await auth.$context
    const user = (await adapter.findOne<{ id: string }>({ model: 'user', where: [{ field: 'email', value: 'sanne@example.com' }] }))!
    const key = { publicKey: 'cHVibGlj', userId: user.id, counter: 0, deviceType: 'multiDevice', backedUp: true, createdAt: new Date() }
    const first = await adapter.create<typeof key & { credentialID: string; id: string }>({ model: 'passkey', data: { ...key, credentialID: 'credential-1' } })
    expect((await request('/token', { cookie })).status).toBe(200)

    const refused = await request('/passkey/delete-passkey', { cookie, body: { id: first.id } })
    expect(refused.status).toBe(403)
    expect(await refused.json()).toMatchObject({ code: 'PASSKEY_REQUIRED' })
    await adapter.create({ model: 'passkey', data: { ...key, credentialID: 'credential-2' } })
    expect((await request('/passkey/delete-passkey', { cookie, body: { id: first.id } })).status).toBe(200)
  })
})
