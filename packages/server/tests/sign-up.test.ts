import { decodeJwt } from 'jose'
import { Kysely } from 'kysely'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { betterAuthAuthenticator } from '../src/better-auth/authenticator'
import { createAuth, type CreateAuthOptions } from '../src/better-auth/create-auth'
import { defaultSignInPolicy } from '../src/better-auth/sign-in-policy'
import { createUser } from '../src/better-auth/users'
import { createAdmin } from '../src/create-admin'
import type { MailMessage } from '../src/mail/smtp-mailer'
import { openSnapshotDb, type SnapshotDb } from '../../../test-support/sql-snapshot'

// Real scrypt hashing runs on this thread, CPU work a busy machine stretches past 5 s.
vi.setConfig({ testTimeout: 30_000 })

const origin = 'http://localhost:5173'
const secret = 'test-secret-test-secret-test-secret-1234'
const password = 'correct horse battery'
const roles = ['admin', 'member', 'editor']

const authOf = (store: SnapshotDb, options: Partial<CreateAuthOptions> = {}) =>
  createAuth({ database: { dialect: store.dialect, type: 'postgres' }, baseURL: origin, secret, roles, defaultRole: 'member', mailer: false, ...options })

// An empty store, and one with an admin and a member, made once: hashing their passwords is the slow part.
let empty: SnapshotDb
let withUsers: SnapshotDb
let appDb: Kysely<any>
beforeAll(async () => {
  empty = await openSnapshotDb('auth')
  withUsers = await empty.clone()
  const auth = authOf(withUsers)
  await createUser(auth, { email: 'root@example.com', password })
  await createUser(auth, { email: 'sanne@example.com', password, role: 'member' })
  appDb = new Kysely<any>({ dialect: empty.dialect })
  // React Email and the templates load with the first auth email; render one here, so no test pays for that load.
  await (await import('../src/better-auth/auth-mail/auth-emails')).accountExistsEmail.render({ app: { name: 'Protobase', url: `${origin}/` } })
}, 60_000)

// Better Auth's rate limits are per client address and kept in memory, so every app gets an address of its own.
let client = 0

// Every app gets a copy of the store with an admin and a member, or of the empty one, and keeps the mail it sends.
const serve = async (options: Partial<CreateAuthOptions> = {}, { users = true } = {}) => {
  const store = await (users ? withUsers : empty).clone()
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
  // Mail goes out after the answer: an answered code request waits for its mail, the first one rendered included.
  const askCode = async (email: string) => {
    const before = sent.length
    const response = await request('/sign-up/send-code', { body: { email } })
    if (response.ok) await expect.poll(() => sent.length, { timeout: 10_000 }).toBeGreaterThan(before)
    return response
  }
  const codeFor = (to: string) => {
    const message = sent.findLast((mail) => mail.to === to)
    const code = message && /^\d{6}$/m.exec(message.text)?.[0]
    if (!code) throw new Error(`No code mailed to ${to}`)
    return code
  }
  const cookiesOf = (response: Response) => response.headers.getSetCookie().map((line) => line.split(';')[0]!).filter((pair) => !pair.endsWith('=')).join('; ')
  const tokenOf = async (cookie: string) => (await (await request('/token', { cookie })).json()) as { token?: string; code?: string }
  const verify = (email: string, code: string) => request('/sign-up/verify-code', { body: { email, code } })
  // The ticket a right code for `to` is traded for: what makes the account.
  const ticketFor = async (to: string) => {
    await askCode(to)
    const { ticket } = (await (await verify(to, codeFor(to))).json()) as { ticket: string }
    return ticket
  }
  return { auth, store, sent, request, askCode, status, codeFor, cookiesOf, tokenOf, verify, ticketFor }
}

const signUp = { role: 'member' }

describe('open sign-up, off by default', () => {
  it('is not offered, and its endpoints and Better Auth\'s own sign-up do not exist or refuse', async () => {
    const { auth, request, status, sent } = await serve()
    expect(auth.signUp).toBe(false)
    expect(await status()).not.toHaveProperty('signUp')
    expect((await request('/sign-up/send-code', { body: { email: 'new@example.com' } })).status).toBe(404)
    expect((await request('/sign-up/verify-code', { body: { email: 'new@example.com', code: '123456' } })).status).toBe(404)
    expect((await request('/sign-up/create', { body: { ticket: 'ticket', name: 'New', password } })).status).toBe(404)
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
    const options = { database: { dialect: empty.dialect, type: 'postgres' as const }, baseURL: origin, secret, roles, mailer: false as const }
    expect(() => createAuth({ ...options, signUp: { role: 'admin' } })).toThrow('signUp.role cannot be admin')
    expect(() => createAuth({ ...options, signUp: { role: 'owner' } })).toThrow('signUp.role "owner" is not one of the roles')
    expect(() => createAuth({ ...options, signUp, organizations: {} })).toThrow('signUp is not available with organizations')
  })
})

describe('open sign-up, turned on', () => {
  // The whole flow, from the mailed code to a second sign-in: longer than one request on a busy runner.
  it('makes a verified account with the sign-up role from the mailed code, signed in, whatever role the request asks for', async () => {
    const { auth, request, status, sent, codeFor, cookiesOf, tokenOf, askCode, verify } = await serve({ signUp, appName: 'Homes' })
    expect(await status()).toMatchObject({ signUp: true })
    const asked = await askCode(' New@Example.com ')
    expect(asked.status).toBe(200)
    expect(await asked.json()).toEqual({ sent: true })
    expect(sent.at(-1)).toMatchObject({ to: 'new@example.com', subject: `${codeFor('new@example.com')} is your code to create an account with Homes` })
    expect(sent.at(-1)!.text).toContain('create your account with Homes')

    // The code is checked on its own, and traded for a ticket; nothing is made or signed in yet.
    const verified = await verify('new@example.com', codeFor('new@example.com'))
    expect(verified.status).toBe(200)
    const { ticket } = (await verified.json()) as { ticket: string }
    expect(ticket).toMatch(/^[\w-]{43}$/)
    expect(cookiesOf(verified)).toBe('')
    expect(await (await auth.$context).internalAdapter.findUserByEmail('new@example.com')).toBeNull()

    const created = await request('/sign-up/create', { body: { ticket, email: 'other@example.com', name: 'Nia', password, role: 'admin', emailVerified: false } })
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
  }, 20_000)

  it('answers the same for an address with an account, mails it no code, and makes no second account', async () => {
    const { auth, request, sent, askCode } = await serve({ signUp })
    const asked = await askCode('sanne@example.com')
    expect(asked.status).toBe(200)
    expect(await asked.json()).toEqual({ sent: true })
    expect(sent.at(-1)).toMatchObject({ to: 'sanne@example.com', subject: 'You already have an account with Protobase' })
    expect(sent.at(-1)!.text).not.toMatch(/\d{6}/)
    expect(sent.at(-1)!.text).toContain(`Sign in to Protobase ${origin}/-/sign-in`)
    expect(await (await request('/sign-up/verify-code', { body: { email: 'sanne@example.com', code: '000000' } })).json()).toMatchObject({ code: 'SIGN_UP_CODE_INVALID' })
    expect((await (await auth.$context).internalAdapter.findUserByEmail('sanne@example.com'))?.user).toMatchObject({ name: 'sanne', role: 'member' })
  })

  it('takes a code once, and only for its address', async () => {
    const { codeFor, askCode, verify } = await serve({ signUp })
    await askCode('new@example.com')
    const code = codeFor('new@example.com')
    expect(await (await verify('other@example.com', code)).json()).toMatchObject({ code: 'SIGN_UP_CODE_INVALID' })
    expect((await verify('new@example.com', code)).status).toBe(200)
    expect(await (await verify('new@example.com', code)).json()).toMatchObject({ code: 'SIGN_UP_CODE_INVALID' })
  })

  it('locks a code out after three wrong tries', async () => {
    const { codeFor, askCode, verify } = await serve({ signUp, signInPerMinute: 100 })
    await askCode('new@example.com')
    const code = codeFor('new@example.com')
    const wrong = code === '000000' ? '111111' : '000000'
    for (let attempt = 0; attempt < 3; attempt++) expect(await (await verify('new@example.com', wrong)).json()).toMatchObject({ code: 'SIGN_UP_CODE_INVALID' })
    expect(await (await verify('new@example.com', code)).json()).toMatchObject({ code: 'SIGN_UP_CODE_INVALID' })
  })

  it('makes one account with a ticket, once, and none with a ticket it did not hand out', async () => {
    const { auth, request, ticketFor } = await serve({ signUp })
    const ticket = await ticketFor('new@example.com')
    expect(await (await request('/sign-up/create', { body: { ticket: `${ticket}x`, name: 'Mallory', password } })).json()).toMatchObject({ code: 'SIGN_UP_TICKET_INVALID' })
    expect(await (await request('/sign-up/create', { body: { ticket: '', name: 'Mallory', password } })).json()).toMatchObject({ code: 'VALIDATION_ERROR' })
    expect((await request('/sign-up/create', { body: { ticket, name: 'Nia', password } })).status).toBe(200)
    expect(await (await request('/sign-up/create', { body: { ticket, name: 'Mallory', password } })).json()).toMatchObject({ code: 'SIGN_UP_TICKET_INVALID' })
    expect((await (await auth.$context).internalAdapter.findUserByEmail('new@example.com'))?.user).toMatchObject({ name: 'Nia' })
  })

  // Two codes and the account: the whole flow, longer than one request on a busy runner.
  it('sends a new code after one lapsed, and makes the account with that one', async () => {
    const { auth, request, codeFor, verify, askCode } = await serve({ signUp })
    await askCode('new@example.com')
    const lapsed = codeFor('new@example.com')
    vi.useFakeTimers({ now: Date.now() + 11 * 60 * 1000, toFake: ['Date'] })
    try {
      expect(await (await verify('new@example.com', lapsed)).json()).toMatchObject({ code: 'SIGN_UP_CODE_INVALID' })
      expect(await (await auth.$context).internalAdapter.findUserByEmail('new@example.com')).toBeNull()
      await askCode('new@example.com')
      const fresh = codeFor('new@example.com')
      const { ticket } = (await (await verify('new@example.com', fresh)).json()) as { ticket: string }
      expect((await request('/sign-up/create', { body: { ticket, name: 'Nia', password } })).status).toBe(200)
    } finally {
      vi.useRealTimers()
    }
  }, 20_000)

  it('takes no ticket once it expired', async () => {
    const { request, ticketFor } = await serve({ signUp })
    const ticket = await ticketFor('new@example.com')
    vi.useFakeTimers({ now: Date.now() + 31 * 60 * 1000, toFake: ['Date'] })
    try {
      expect(await (await request('/sign-up/create', { body: { ticket, name: 'Nia', password } })).json()).toMatchObject({ code: 'SIGN_UP_TICKET_INVALID' })
    } finally {
      vi.useRealTimers()
    }
  })

  it('follows the sign-in policy for the password, and keeps the ticket when the password is refused', async () => {
    const { request, cookiesOf, ticketFor } = await serve({ signUp })
    const root = cookiesOf(await request('/sign-in/email', { body: { email: 'root@example.com', password } }))
    expect((await request('/policy/sign-in', { cookie: root, body: { ...defaultSignInPolicy, password: 'forbidden' } })).status).toBe(200)
    const ticket = await ticketFor('new@example.com')
    expect(await (await request('/sign-up/create', { body: { ticket, name: 'Nia', password } })).json()).toMatchObject({ code: 'SIGN_IN_METHOD_FORBIDDEN' })
    expect((await request('/sign-up/create', { body: { ticket, name: 'Nia' } })).status).toBe(200)
  })

  it('needs a password while emailed codes are off', async () => {
    const { request, cookiesOf, ticketFor } = await serve({ signUp })
    const root = cookiesOf(await request('/sign-in/email', { body: { email: 'root@example.com', password } }))
    expect((await request('/policy/sign-in', { cookie: root, body: { ...defaultSignInPolicy, emailCode: 'forbidden' } })).status).toBe(200)
    const ticket = await ticketFor('new@example.com')
    expect(await (await request('/sign-up/create', { body: { ticket, name: 'Nia' } })).json()).toMatchObject({ code: 'PASSWORD_REQUIRED' })
    expect(await (await request('/sign-up/create', { body: { ticket, name: 'Nia', password: 'short' } })).json()).toMatchObject({ code: 'PASSWORD_LENGTH' })
  })

  it('holds the token back until what the policy requires is set up, as after any sign-in', async () => {
    const { request, cookiesOf, tokenOf, ticketFor } = await serve({ signUp })
    const root = cookiesOf(await request('/sign-in/email', { body: { email: 'root@example.com', password } }))
    expect((await request('/policy/sign-in', { cookie: root, body: { ...defaultSignInPolicy, twoFactor: 'required' } })).status).toBe(200)
    const created = await request('/sign-up/create', { body: { ticket: await ticketFor('new@example.com'), name: 'Nia', password } })
    expect(created.status).toBe(200)
    expect(await tokenOf(cookiesOf(created))).toMatchObject({ code: 'SIGN_IN_SETUP_REQUIRED' })
  })

  it('makes no account while the store has no user: the first admin is made on the host', async () => {
    const { request, sent } = await serve({ signUp }, { users: false })
    expect(await (await request('/sign-up/send-code', { body: { email: 'new@example.com' } })).json()).toMatchObject({ code: 'NO_ADMIN_YET' })
    expect(await (await request('/sign-up/verify-code', { body: { email: 'new@example.com', code: '123456' } })).json()).toMatchObject({ code: 'NO_ADMIN_YET' })
    expect(await (await request('/sign-up/create', { body: { ticket: 'ticket', name: 'Nia', password } })).json()).toMatchObject({ code: 'NO_ADMIN_YET' })
    expect(sent).toEqual([])
  })

  it('limits code requests per client as sign-ins are', async () => {
    const { request } = await serve({ signUp })
    const answers = []
    for (let attempt = 0; attempt < 6; attempt++) answers.push((await request('/sign-up/send-code', { body: { email: `new${attempt}@example.com` } })).status)
    expect(answers).toEqual([200, 200, 200, 200, 200, 429])
  })

  it('limits code checks per client as sign-ins are', async () => {
    const { verify } = await serve({ signUp })
    const answers = []
    for (let attempt = 0; attempt < 6; attempt++) answers.push((await verify(`new${attempt}@example.com`, '000000')).status)
    expect(answers).toEqual([400, 400, 400, 400, 400, 429])
  })
})
