import { PGlite } from '@electric-sql/pglite'
import { Kysely } from 'kysely'
import { PGliteDialect } from 'kysely-pglite-dialect'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { betterAuthAuthenticator } from '../src/better-auth/authenticator'
import { createAuth, type CreateAuthOptions } from '../src/better-auth/create-auth'
import { defaultSignInPolicy, type SignInPolicy } from '../src/better-auth/sign-in-policy'
import { createUser } from '../src/better-auth/users'
import { createAdmin } from '../src/create-admin'
import type { MailMessage } from '../src/mail/smtp-mailer'
import { createAuthStore } from '../../../test-support/auth'
import { operatorClient, operatorIssuer, permittedStaff, startFakeOperator } from './support/fake-operator'

const origin = 'http://localhost:5173'
const secret = 'test-secret-test-secret-test-secret-1234'
const password = 'correct horse battery'
const reason = 'Ticket 4211: the invoice totals look wrong'

let shared: PGlite
let appDb: Kysely<any>
beforeAll(async () => {
  shared = await createAuthStore()
  appDb = new Kysely<any>({ dialect: new PGliteDialect(shared) })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// Better Auth's rate limits are per client address and kept in memory, so every app gets an address of its own.
let client = 0

const cookiesOf = (response: Response) => response.headers.getSetCookie().map((line) => line.split(';')[0]!)
// The browser's cookies after a response: set ones replace those of the same name, expired ones go.
const merge = (jar: string, response: Response) => {
  const cookies = new Map(jar.split('; ').filter(Boolean).map((pair) => [pair.slice(0, pair.indexOf('=')), pair] as const))
  for (const pair of cookiesOf(response)) {
    const name = pair.slice(0, pair.indexOf('='))
    if (pair.endsWith('=')) cookies.delete(name)
    else cookies.set(name, pair)
  }
  return [...cookies.values()].join('; ')
}

// Every app gets a copy of the migrated store with an admin and a user, an operator provider, and keeps its mail.
const serve = async (options: Partial<CreateAuthOptions> = {}) => {
  const operator = await startFakeOperator()
  const store = (await shared.clone()) as PGlite
  const sent: MailMessage[] = []
  const auth = createAuth({
    database: { dialect: new PGliteDialect(store), type: 'postgres' },
    baseURL: origin,
    secret,
    mailer: { send: async (message) => void sent.push(message) },
    operator: { issuer: operatorIssuer, ...operatorClient, name: 'Operator Cloud' },
    ...options,
  })
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
  const signIn = async (email: string) => cookiesOf(await request('/sign-in/email', { body: { email, password } })).join('; ')
  const savePolicy = async (changes: Partial<SignInPolicy>) => {
    const saved = await request('/policy/sign-in', { cookie: await signIn('root@example.com'), body: { ...defaultSignInPolicy, ...changes } })
    expect(saved.status).toBe(200)
  }

  // The staff member's browser: the staff sign-in page, the operator provider, and back through the callback.
  const staffSignIn = async ({ email = 'sanne@example.com', claims = permittedStaff() as Record<string, unknown>, jar = '' } = {}) => {
    const start = await request('/staff/sign-in', { body: { email, reason, callbackURL: `${origin}/` }, cookie: jar })
    expect(start.status).toBe(200)
    const { url } = (await start.json()) as { url: string }
    const { code, state } = operator.approve(url, claims)
    const browser = merge(jar, start)
    const callback = await request(`/staff/callback?code=${code}&state=${encodeURIComponent(state)}`, { cookie: browser })
    return { url, callback, browser: merge(browser, callback), state, code }
  }
  const staffSignIns = async () => (await (await request('/staff/sign-ins', { cookie: await signIn('root@example.com') })).json()).signIns
  return { auth, store, sent, operator, request, signIn, savePolicy, staffSignIn, staffSignIns }
}

describe('a staff sign-in through the operator provider', () => {
  it('signs staff in as the person, past the policy, with a banner record, until they stop', async () => {
    const { request, savePolicy, staffSignIn, staffSignIns, operator } = await serve()
    await savePolicy({ twoFactor: 'required', passkey: 'required' })

    const { url, callback, browser } = await staffSignIn()
    const authorize = new URL(url)
    expect(authorize.origin + authorize.pathname).toBe(`${operatorIssuer}/authorize`)
    expect(Object.fromEntries(authorize.searchParams)).toMatchObject({
      response_type: 'code',
      client_id: operatorClient.clientId,
      redirect_uri: `${origin}/api/auth/staff/callback`,
      scope: 'openid email profile',
      code_challenge_method: 'S256',
      max_age: '900',
    })
    expect(operator.exchanged).toHaveLength(1)
    expect(callback.status).toBe(302)
    expect(callback.headers.get('location')).toBe(`${origin}/`)

    const { session, user } = await (await request('/get-session', { cookie: browser })).json()
    expect(user.email).toBe('sanne@example.com')
    expect(session.impersonatedBy).toBe('alex@operator.example')
    const minutes = (Date.parse(session.expiresAt) - Date.now()) / 60_000
    expect(minutes).toBeGreaterThan(29)
    expect(minutes).toBeLessThanOrEqual(30)

    // The policy requires two-factor and a passkey, which Sanne lacks; staff get a token anyway.
    expect((await request('/token', { cookie: browser })).status).toBe(200)
    expect(await (await request('/account/sign-in-methods', { cookie: browser })).json()).toMatchObject({ missing: [] })

    const { staff } = await (await request('/staff/session', { cookie: browser })).json()
    expect(staff).toMatchObject({ user: 'sanne@example.com', staff: 'alex@operator.example', staffName: 'Alex Operator', reason })
    expect(staff.endedAt).toBeUndefined()

    const stopped = await request('/staff/stop', { cookie: browser, body: {} })
    expect(stopped.status).toBe(200)
    expect(await (await request('/get-session', { cookie: merge(browser, stopped) })).json()).toBeNull()
    // The old cookie does not work either: the session is gone.
    expect(await (await request('/get-session', { cookie: browser })).json()).toBeNull()

    const [logged] = await staffSignIns()
    expect(logged).toMatchObject({ user: 'sanne@example.com', staff: 'alex@operator.example', reason })
    expect(Date.parse(logged.endedAt)).toBeGreaterThan(Date.now() - 60_000)
  })

  it('is offered on the status with the provider name, unless the policy turns it off', async () => {
    const { request, savePolicy } = await serve()
    expect(await (await request('/status')).json()).toMatchObject({ staffSignIn: 'Operator Cloud' })
    await savePolicy({ staffAccess: 'forbidden' })
    expect(await (await request('/status')).json()).not.toHaveProperty('staffSignIn')
    const refused = await request('/staff/sign-in', { body: { email: 'sanne@example.com', reason, callbackURL: `${origin}/` } })
    expect(refused.status).toBe(403)
    expect(await refused.json()).toMatchObject({ code: 'SIGN_IN_METHOD_FORBIDDEN', message: 'Staff sign-in is turned off for this app.' })
  })

  it('is not there without an operator provider', async () => {
    const { request } = await serve({ operator: false })
    expect(await (await request('/status')).json()).not.toHaveProperty('staffSignIn')
    expect((await request('/staff/sign-in', { body: { email: 'sanne@example.com', reason, callbackURL: `${origin}/` } })).status).toBe(404)
  })
})

describe('the guardrails of a staff sign-in', () => {
  it('needs a reason', async () => {
    const { request } = await serve()
    const refused = await request('/staff/sign-in', { body: { email: 'sanne@example.com', reason: 'debug', callbackURL: `${origin}/` } })
    expect(refused.status).toBe(400)
    expect(await refused.json()).toMatchObject({ code: 'STAFF_REASON_REQUIRED' })
  })

  it('sends staff back without a session or a log entry when the provider does not vouch for them', async () => {
    const { request, staffSignIn, staffSignIns } = await serve()
    const cases = [
      { claims: { ...permittedStaff(), groups: ['support'] }, code: 'STAFF_PERMISSION_MISSING' },
      { claims: { ...permittedStaff(), amr: ['pwd'] }, code: 'STAFF_SIGN_IN_NOT_STRONG' },
      { claims: { ...permittedStaff(), auth_time: Math.floor(Date.now() / 1000) - 3600 }, code: 'STAFF_SIGN_IN_STALE' },
    ]
    for (const { claims, code } of cases) {
      const { callback, browser } = await staffSignIn({ claims })
      expect(callback.status).toBe(302)
      expect(callback.headers.get('location')).toBe(`${origin}/?staff-error=${code}`)
      expect(await (await request('/get-session', { cookie: browser })).json()).toBeNull()
    }
    expect(await staffSignIns()).toEqual([])
  })

  it('refuses an unknown person', async () => {
    const { staffSignIn } = await serve()
    expect((await staffSignIn({ email: 'nobody@example.com' })).callback.headers.get('location')).toBe(`${origin}/?staff-error=STAFF_USER_UNAVAILABLE`)
  })

  it('checks the policy again when the staff member comes back', async () => {
    const { request, savePolicy, operator } = await serve()
    const start = await request('/staff/sign-in', { body: { email: 'sanne@example.com', reason, callbackURL: `${origin}/` } })
    const { code, state } = operator.approve(((await start.json()) as { url: string }).url, permittedStaff())
    await savePolicy({ staffAccess: 'forbidden' })
    const callback = await request(`/staff/callback?code=${code}&state=${state}`, { cookie: merge('', start) })
    expect(callback.headers.get('location')).toBe(`${origin}/?staff-error=SIGN_IN_METHOD_FORBIDDEN`)
  })

  it('emails the person when the policy says so', async () => {
    const { savePolicy, staffSignIn, sent } = await serve()
    await savePolicy({ staffAccess: 'notify' })
    expect((await staffSignIn()).callback.headers.get('location')).toBe(`${origin}/`)
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ to: 'sanne@example.com', subject: 'Staff signed in as you' })
    expect(sent[0]!.text).toContain('alex@operator.example')
    expect(sent[0]!.text).toContain(reason)
  })

  it('finishes only in the browser that started it, and once', async () => {
    const { request, operator } = await serve()
    const start = await request('/staff/sign-in', { body: { email: 'sanne@example.com', reason, callbackURL: `${origin}/` } })
    const { code, state } = operator.approve(((await start.json()) as { url: string }).url, permittedStaff())
    const elsewhere = await request(`/staff/callback?code=${code}&state=${state}`)
    expect(elsewhere.status).toBe(400)
    expect(await elsewhere.json()).toMatchObject({ code: 'STAFF_SIGN_IN_EXPIRED' })
    expect((await request(`/staff/callback?code=${code}&state=${state}`, { cookie: merge('', start) })).status).toBe(302)
    expect((await request(`/staff/callback?code=${code}&state=${state}`, { cookie: merge('', start) })).status).toBe(400)
  })

  it('goes back only to a trusted origin', async () => {
    const { request } = await serve()
    const refused = await request('/staff/sign-in', { body: { email: 'sanne@example.com', reason, callbackURL: 'https://evil.example/' } })
    expect(refused.status).toBe(403)
    expect(await refused.json()).toMatchObject({ code: 'INVALID_CALLBACK_URL' })
    expect((await request('/staff/sign-in', { body: { email: 'sanne@example.com', reason, callbackURL: '/admin/' } })).status).toBe(200)
  })

  it("cannot change the person's sign-in or the sign-in policy", async () => {
    const { request, staffSignIn } = await serve()
    const { browser: staff } = await staffSignIn({ email: 'root@example.com' })
    for (const [path, body] of [
      ['/change-password', { currentPassword: password, newPassword: 'another long password' }],
      ['/two-factor/enable', { password }],
      ['/passkey/generate-register-options', undefined],
      ['/policy/sign-in', { ...defaultSignInPolicy, staffAccess: 'allowed' }],
    ] as const) {
      const refused = await request(path, { cookie: staff, ...(body && { body }) })
      expect(refused.status).toBe(403)
      expect(await refused.json()).toMatchObject({ code: 'STAFF_CANNOT_CHANGE_SIGN_IN' })
    }
    expect((await request('/policy/sign-in', { cookie: staff })).status).toBe(200)
  })

  it("leaves no other way to sign in as someone: the admin plugin's own impersonation is off", async () => {
    const { request, signIn, auth } = await serve()
    const root = await signIn('root@example.com')
    const sanne = (await auth.$context).internalAdapter.findUserByEmail('sanne@example.com')
    expect((await request('/admin/impersonate-user', { cookie: root, body: { userId: (await sanne)!.user.id } })).status).toBe(404)
    expect((await request('/admin/stop-impersonating', { cookie: root, body: {} })).status).toBe(404)
  })

  it('shows the log to admins only', async () => {
    const { request, signIn } = await serve()
    const refused = await request('/staff/sign-ins', { cookie: await signIn('sanne@example.com') })
    expect(refused.status).toBe(403)
    expect(await refused.json()).toMatchObject({ code: 'ADMIN_ONLY' })
  })

  it('tells a session of the person themselves it is not a staff session', async () => {
    const { request, signIn } = await serve()
    const sanne = await signIn('sanne@example.com')
    expect(await (await request('/staff/session', { cookie: sanne })).json()).toEqual({ staff: null })
    expect((await request('/staff/stop', { cookie: sanne, body: {} })).status).toBe(400)
  })
})
