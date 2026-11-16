import { decodeJwt } from 'jose'
import { describe, expect, it, vi } from 'vitest'
import { createAuth } from '../src/better-auth/create-auth'
import { defaultSignInPolicy } from '../src/better-auth/sign-in-policy'
import { origin, password, signUpServer } from './support/sign-up-app'

// Real scrypt hashing runs on this thread, CPU work a busy machine stretches past 5 s.
vi.setConfig({ testTimeout: 30_000 })

const secret = 'test-secret-test-secret-test-secret-1234'
const roles = ['admin', 'member', 'editor']
const { serve, dialect } = signUpServer()

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
    const options = { database: { dialect: dialect(), type: 'postgres' as const }, baseURL: origin, secret, roles, mailer: false as const }
    expect(() => createAuth({ ...options, signUp: { role: 'admin' } })).toThrow('signUp.role cannot be admin')
    expect(() => createAuth({ ...options, signUp: { role: 'owner' } })).toThrow('signUp.role "owner" is not one of the roles')
    expect(() => createAuth({ ...options, signUp, organizations: {} })).toThrow('signUp is not available with organizations')
    expect(() => createAuth({ ...options, signUp: { role: 'member', fields: ['name'] } })).toThrow("signUp.fields needs 'email'")
  })
})

describe('open sign-up, turned on', () => {
  // The whole flow, from the mailed code to a second sign-in: longer than one request on a busy runner.
  it('makes a verified account with the sign-up role from the mailed code, signed in, whatever role the request asks for', async () => {
    const { auth, request, status, sent, codeFor, cookiesOf, tokenOf, askCode, verify } = await serve({ signUp, appName: 'Homes' })
    expect(await status()).toMatchObject({ signUp: true, signUpFields: ['email', 'name'] })
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

describe('open sign-up, limited to email domains', () => {
  const limited = { role: 'member', domains: ['Example.com'] }

  // The whole flow, from the mailed code to the account: longer than one request on a busy runner.
  it('makes the account of an address at a listed domain or a subdomain of one, whatever its case', async () => {
    const { auth, request, status, askCode, codeFor, verify } = await serve({ signUp: limited })
    expect(auth.signUpDomains).toEqual(['example.com'])
    expect(await status()).toMatchObject({ signUp: true })
    await askCode('nia@Mail.Example.com')
    const { ticket } = (await (await verify('nia@Mail.Example.com', codeFor('nia@mail.example.com'))).json()) as { ticket: string }
    expect((await request('/sign-up/create', { body: { ticket, name: 'Nia', password } })).status).toBe(200)
    expect((await (await auth.$context).internalAdapter.findUserByEmail('nia@mail.example.com'))?.user).toMatchObject({ role: 'member', emailVerified: true })
  }, 20_000)

  it('refuses an address elsewhere at every step, mails it nothing and makes no account', async () => {
    const { auth, request, sent, verify } = await serve({ signUp: limited })
    for (const email of ['new@elsewhere.test', 'new@notexample.com']) {
      const asked = await request('/sign-up/send-code', { body: { email } })
      expect(asked.status).toBe(403)
      expect(await asked.json()).toMatchObject({ code: 'EMAIL_DOMAIN_NOT_ALLOWED' })
      expect(await (await verify(email, '123456')).json()).toMatchObject({ code: 'EMAIL_DOMAIN_NOT_ALLOWED' })
      expect(await (await auth.$context).internalAdapter.findUserByEmail(email)).toBeNull()
    }
    expect(sent).toEqual([])
  })

  it('is off with an empty list, from the app or the platform, never open to all', async () => {
    for (const options of [{ signUp: { role: 'member', domains: [] } }, { signUp }]) {
      vi.stubEnv('PROTOBASE_SIGN_UP_DOMAINS', options.signUp === signUp ? '' : undefined)
      try {
        const { auth, request, status, sent } = await serve(options)
        expect(auth.signUp).toBe(false)
        expect(auth.signUpTakes('new@example.com')).toBe(false)
        expect(await status()).not.toHaveProperty('signUp')
        expect((await request('/sign-up/send-code', { body: { email: 'new@example.com' } })).status).toBe(404)
        expect(sent).toEqual([])
      } finally {
        vi.unstubAllEnvs()
      }
    }
  })
})
