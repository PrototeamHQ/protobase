import { PGlite } from '@electric-sql/pglite'
import { decodeJwt } from 'jose'
import { Kysely } from 'kysely'
import { PGliteDialect } from 'kysely-pglite-dialect'
import { beforeAll, describe, expect, it } from 'vitest'
import { betterAuthAuthenticator } from '../src/better-auth/authenticator'
import { createAuth, type CreateAuthOptions } from '../src/better-auth/create-auth'
import { defaultSignInPolicy } from '../src/better-auth/sign-in-policy'
import { createUser } from '../src/better-auth/users'
import { createAdmin } from '../src/create-admin'
import type { MailMessage } from '../src/mail/smtp-mailer'
import { createAuthStore } from '../../../test-support/auth'

const origin = 'http://localhost:5173'
const secret = 'test-secret-test-secret-test-secret-1234'
const password = 'correct horse battery'
const roles = ['admin', 'member', 'editor']

const authOf = (store: PGlite, options: Partial<CreateAuthOptions> = {}) =>
  createAuth({ database: { dialect: new PGliteDialect(store), type: 'postgres' }, baseURL: origin, secret, roles, defaultRole: 'member', mailer: false, ...options })

// An empty store, and one with an admin and a member, made once: hashing their passwords is the slow part.
let empty: PGlite
let withUsers: PGlite
let appDb: Kysely<any>
beforeAll(async () => {
  empty = await createAuthStore()
  withUsers = (await empty.clone()) as PGlite
  const auth = authOf(withUsers)
  await createUser(auth, { email: 'root@example.com', password })
  await createUser(auth, { email: 'sanne@example.com', password, role: 'member' })
  appDb = new Kysely<any>({ dialect: new PGliteDialect(empty) })
})

// Better Auth's rate limits are per client address and kept in memory, so every app gets an address of its own.
let client = 0

// Every app gets a copy of the store with an admin and a member, or of the empty one, and keeps the mail it sends.
const serve = async (options: Partial<CreateAuthOptions> = {}, { users = true } = {}) => {
  const store = (await (users ? withUsers : empty).clone()) as PGlite
  const sent: MailMessage[] = []
  const auth = authOf(store, { mailer: { send: async (message) => void sent.push(message) }, ...options })
  const app = createAdmin({ resources: [], db: appDb, authenticate: betterAuthAuthenticator({ auth }), auth })
  const address = `192.0.2.${++client}`
  const request = (path: string, init: { body?: unknown; cookie?: string } = {}) =>
    app.request(`${origin}/api/auth${path}`, {
      method: init.body === undefined ? 'GET' : 'POST',
      headers: { 'content-type': 'application/json', origin, 'x-forwarded-for': address, ...(init.cookie && { cookie: init.cookie }) },
      ...(init.body !== undefined && { body: JSON.stringify(init.body) }),
    })
  const status = async () => (await request('/status')).json()
  const codeFor = (to: string) => {
    const message = sent.findLast((mail) => mail.to === to)
    const code = message && /^\d{6}$/m.exec(message.text)?.[0]
    if (!code) throw new Error(`No code mailed to ${to}`)
    return code
  }
  const cookiesOf = (response: Response) => response.headers.getSetCookie().map((line) => line.split(';')[0]!).filter((pair) => !pair.endsWith('=')).join('; ')
  const tokenOf = async (cookie: string) => (await (await request('/token', { cookie })).json()) as { token?: string; code?: string }
  return { auth, store, sent, request, status, codeFor, cookiesOf, tokenOf }
}

const signUp = { role: 'member' }

describe('open sign-up, off by default', () => {
  it('is not offered, and its endpoints and Better Auth\'s own sign-up do not exist or refuse', async () => {
    const { auth, request, status, sent } = await serve()
    expect(auth.signUp).toBe(false)
    expect(await status()).not.toHaveProperty('signUp')
    expect((await request('/sign-up/send-code', { body: { email: 'new@example.com' } })).status).toBe(404)
    expect((await request('/sign-up/create', { body: { email: 'new@example.com', code: '123456', name: 'New', password } })).status).toBe(404)
    const native = await request('/sign-up/email', { body: { email: 'new@example.com', name: 'New', password } })
    expect(native.status).toBeGreaterThanOrEqual(400)
    expect(await (await auth.$context).internalAdapter.findUserByEmail('new@example.com')).toBeNull()
    expect(sent).toEqual([])
  })

  it('is not offered without a mailer, which sends the codes', async () => {
    const { auth, request, status } = await serve({ signUp, mailer: false })
    expect(auth.signUp).toBe(false)
    expect(await status()).not.toHaveProperty('signUp')
    expect((await request('/sign-up/send-code', { body: { email: 'new@example.com' } })).status).toBe(404)
  })

  it('refuses a sign-up role that is admin or none of the roles, and organizations', () => {
    const options = { database: { dialect: new PGliteDialect(new PGlite()), type: 'postgres' as const }, baseURL: origin, secret, roles, mailer: false as const }
    expect(() => createAuth({ ...options, signUp: { role: 'admin' } })).toThrow('signUp.role cannot be admin')
    expect(() => createAuth({ ...options, signUp: { role: 'owner' } })).toThrow('signUp.role "owner" is not one of the roles')
    expect(() => createAuth({ ...options, signUp, organizations: {} })).toThrow('signUp is not available with organizations')
  })
})

describe('open sign-up, turned on', () => {
  it('makes a verified account with the sign-up role from the mailed code, signed in, whatever role the request asks for', async () => {
    const { auth, request, status, sent, codeFor, cookiesOf, tokenOf } = await serve({ signUp, appName: 'Homes' })
    expect(await status()).toMatchObject({ signUp: true })
    const asked = await request('/sign-up/send-code', { body: { email: ' New@Example.com ' } })
    expect(asked.status).toBe(200)
    expect(await asked.json()).toEqual({ sent: true })
    expect(sent.at(-1)).toMatchObject({ to: 'new@example.com', subject: 'Your code to create an account' })
    expect(sent.at(-1)!.text).toContain('create your account for Homes')

    const created = await request('/sign-up/create', { body: { email: 'new@example.com', code: codeFor('new@example.com'), name: 'Nia', password, role: 'admin', emailVerified: false } })
    expect(created.status).toBe(200)
    expect(await created.json()).toEqual({ user: { id: expect.any(String), email: 'new@example.com', name: 'Nia', role: 'member' } })
    const user = await (await auth.$context).internalAdapter.findUserByEmail('new@example.com')
    expect(user?.user).toMatchObject({ role: 'member', emailVerified: true, name: 'Nia' })

    // The session is the new member's, and so is the token: no other role, no admin.
    const { token } = await tokenOf(cookiesOf(created))
    expect(decodeJwt(token!)).toMatchObject({ sub: user!.user.id, email: 'new@example.com', role: 'member' })
    expect((await request('/admin/list-users', { cookie: cookiesOf(created) })).status).toBe(403)

    // Signing in again works with the password chosen.
    expect((await request('/sign-in/email', { body: { email: 'new@example.com', password } })).status).toBe(200)
  })

  it('answers the same for an address with an account, mails it no code, and makes no second account', async () => {
    const { auth, request, sent } = await serve({ signUp })
    const asked = await request('/sign-up/send-code', { body: { email: 'sanne@example.com' } })
    expect(asked.status).toBe(200)
    expect(await asked.json()).toEqual({ sent: true })
    expect(sent.at(-1)).toMatchObject({ to: 'sanne@example.com', subject: 'You already have an account' })
    expect(sent.at(-1)!.text).not.toMatch(/\d{6}/)
    const guessed = await request('/sign-up/create', { body: { email: 'sanne@example.com', code: '000000', name: 'Mallory', password: 'mallory-password-1' } })
    expect(await guessed.json()).toMatchObject({ code: 'SIGN_UP_CODE_INVALID' })
    expect((await (await auth.$context).internalAdapter.findUserByEmail('sanne@example.com'))?.user).toMatchObject({ name: 'sanne', role: 'member' })
  })

  it('takes a code once, and only for its address', async () => {
    const { request, codeFor } = await serve({ signUp })
    await request('/sign-up/send-code', { body: { email: 'new@example.com' } })
    const code = codeFor('new@example.com')
    expect(await (await request('/sign-up/create', { body: { email: 'other@example.com', code, name: 'Other', password } })).json()).toMatchObject({ code: 'SIGN_UP_CODE_INVALID' })
    expect((await request('/sign-up/create', { body: { email: 'new@example.com', code, name: 'Nia', password } })).status).toBe(200)
    expect(await (await request('/sign-up/create', { body: { email: 'new@example.com', code, name: 'Nia', password } })).json()).toMatchObject({ code: 'SIGN_UP_CODE_INVALID' })
  })

  it('locks a code out after three wrong tries', async () => {
    const { request, codeFor } = await serve({ signUp, signInPerMinute: 100 })
    await request('/sign-up/send-code', { body: { email: 'new@example.com' } })
    const code = codeFor('new@example.com')
    const wrong = code === '000000' ? '111111' : '000000'
    for (let attempt = 0; attempt < 3; attempt++) {
      expect(await (await request('/sign-up/create', { body: { email: 'new@example.com', code: wrong, name: 'Nia', password } })).json()).toMatchObject({ code: 'SIGN_UP_CODE_INVALID' })
    }
    expect(await (await request('/sign-up/create', { body: { email: 'new@example.com', code, name: 'Nia', password } })).json()).toMatchObject({ code: 'SIGN_UP_CODE_INVALID' })
  })

  it('follows the sign-in policy for the password, and keeps the code when the password is refused', async () => {
    const { request, codeFor, cookiesOf } = await serve({ signUp })
    const root = cookiesOf(await request('/sign-in/email', { body: { email: 'root@example.com', password } }))
    expect((await request('/policy/sign-in', { cookie: root, body: { ...defaultSignInPolicy, password: 'forbidden' } })).status).toBe(200)
    await request('/sign-up/send-code', { body: { email: 'new@example.com' } })
    const code = codeFor('new@example.com')
    expect(await (await request('/sign-up/create', { body: { email: 'new@example.com', code, name: 'Nia', password } })).json()).toMatchObject({ code: 'SIGN_IN_METHOD_FORBIDDEN' })
    expect((await request('/sign-up/create', { body: { email: 'new@example.com', code, name: 'Nia' } })).status).toBe(200)
  })

  it('needs a password while emailed codes are off', async () => {
    const { request, codeFor, cookiesOf } = await serve({ signUp })
    const root = cookiesOf(await request('/sign-in/email', { body: { email: 'root@example.com', password } }))
    expect((await request('/policy/sign-in', { cookie: root, body: { ...defaultSignInPolicy, emailCode: 'forbidden' } })).status).toBe(200)
    await request('/sign-up/send-code', { body: { email: 'new@example.com' } })
    expect(await (await request('/sign-up/create', { body: { email: 'new@example.com', code: codeFor('new@example.com'), name: 'Nia' } })).json()).toMatchObject({ code: 'PASSWORD_REQUIRED' })
    expect(await (await request('/sign-up/create', { body: { email: 'new@example.com', code: codeFor('new@example.com'), name: 'Nia', password: 'short' } })).json()).toMatchObject({ code: 'PASSWORD_LENGTH' })
  })

  it('holds the token back until what the policy requires is set up, as after any sign-in', async () => {
    const { request, codeFor, cookiesOf, tokenOf } = await serve({ signUp })
    const root = cookiesOf(await request('/sign-in/email', { body: { email: 'root@example.com', password } }))
    expect((await request('/policy/sign-in', { cookie: root, body: { ...defaultSignInPolicy, twoFactor: 'required' } })).status).toBe(200)
    await request('/sign-up/send-code', { body: { email: 'new@example.com' } })
    const created = await request('/sign-up/create', { body: { email: 'new@example.com', code: codeFor('new@example.com'), name: 'Nia', password } })
    expect(created.status).toBe(200)
    expect(await tokenOf(cookiesOf(created))).toMatchObject({ code: 'SIGN_IN_SETUP_REQUIRED' })
  })

  it('makes no account while the store has no user: the first admin is made on the host', async () => {
    const { request, sent } = await serve({ signUp }, { users: false })
    expect(await (await request('/sign-up/send-code', { body: { email: 'new@example.com' } })).json()).toMatchObject({ code: 'NO_ADMIN_YET' })
    expect(await (await request('/sign-up/create', { body: { email: 'new@example.com', code: '123456', name: 'Nia', password } })).json()).toMatchObject({ code: 'NO_ADMIN_YET' })
    expect(sent).toEqual([])
  })

  it('limits code requests per client as sign-ins are', async () => {
    const { request } = await serve({ signUp })
    const answers = []
    for (let attempt = 0; attempt < 6; attempt++) answers.push((await request('/sign-up/send-code', { body: { email: `new${attempt}@example.com` } })).status)
    expect(answers).toEqual([200, 200, 200, 200, 200, 429])
  })
})
