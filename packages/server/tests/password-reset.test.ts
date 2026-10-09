import { PGlite } from '@electric-sql/pglite'
import { Kysely } from 'kysely'
import { PGliteDialect } from 'kysely-pglite-dialect'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { betterAuthAuthenticator } from '../src/better-auth/authenticator'
import { createAuth, type CreateAuthOptions } from '../src/better-auth/create-auth'
import { resetEmail } from '../src/better-auth/password-reset'
import { createUser } from '../src/better-auth/users'
import { createAdmin } from '../src/create-admin'
import { createAuthStore } from '../../../test-support/auth'
import type { MailMessage } from '../src/mail/smtp-mailer'

const origin = 'http://localhost:5173'
const secret = 'test-secret-test-secret-test-secret-1234'
const password = 'correct horse battery'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

const authWith = (options: Partial<CreateAuthOptions>, store: PGlite) =>
  createAuth({ database: { dialect: new PGliteDialect(store), type: 'postgres' }, baseURL: origin, secret, ...options })

// One migrated store for the instances that are only created, so Better Auth's schema check stays quiet.
let shared: PGlite
// The apps have no resources and never query their database; a fresh PGlite would only cost a cold start.
let appDb: Kysely<any>
beforeAll(async () => {
  shared = await createAuthStore()
  appDb = new Kysely<any>({ dialect: new PGliteDialect(shared) })
})

// Better Auth's rate limits are per client address and kept in memory, so every app gets an address of its own.
let client = 0

// Every app gets a copy of the migrated store, so no app sees another's users.
const serve = async (options: Partial<CreateAuthOptions> = {}) => {
  const auth = authWith(options, (await shared.clone()) as PGlite)
  const address = `203.0.113.${++client}`
  await createUser(auth, { email: 'root@example.com', password })
  const app = createAdmin({ resources: [], db: appDb, authenticate: betterAuthAuthenticator({ auth }), auth })
  const status = async () => (await app.request(`${origin}/api/auth/status`)).json()
  const requestReset = (email: string) =>
    app.request(`${origin}/api/auth/request-password-reset`, { method: 'POST', headers: { 'content-type': 'application/json', origin, 'x-forwarded-for': address }, body: JSON.stringify({ email, redirectTo: `${origin}/?password-reset` }) })
  return { auth, status, requestReset }
}

const recordingMailer = () => {
  const sent: MailMessage[] = []
  return { sent, mailer: { send: async (message: MailMessage) => void sent.push(message) } }
}

describe('password reset is on only with mail', () => {
  it('is off without PROTOBASE_SMTP_URL: the status says so and a request is refused without sending anything', async () => {
    vi.stubEnv('PROTOBASE_SMTP_URL', '')
    vi.stubEnv('PROTOBASE_MAIL_FROM', '')
    const { auth, status, requestReset } = await serve()
    expect(auth.passwordReset).toBe(false)
    expect(await status()).toEqual({ needsAdmin: false, passwordReset: false })
    const response = await requestReset('root@example.com')
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ code: 'RESET_PASSWORD_DISABLED' })
  })

  it('is on with the platform\'s PROTOBASE_SMTP_URL and PROTOBASE_MAIL_FROM, unless the project passes `mailer: false`', () => {
    vi.stubEnv('PROTOBASE_SMTP_URL', 'smtp://tenant:s3cret@relay.example.net:587')
    vi.stubEnv('PROTOBASE_MAIL_FROM', 'noreply@acme.example.com')
    expect(authWith({}, shared).passwordReset).toBe(true)
    expect(authWith({ mailer: false }, shared).passwordReset).toBe(false)
  })

  it('stops createAuth on half a mail configuration', () => {
    vi.stubEnv('PROTOBASE_SMTP_URL', 'smtp://relay.example.net:587')
    vi.stubEnv('PROTOBASE_MAIL_FROM', '')
    expect(() => authWith({}, shared)).toThrow('PROTOBASE_SMTP_URL and PROTOBASE_MAIL_FROM go together')
  })

  it('is on with a mailer the project passes, whatever the environment says', async () => {
    vi.stubEnv('PROTOBASE_SMTP_URL', '')
    const { mailer } = recordingMailer()
    const { auth, status } = await serve({ mailer })
    expect(auth.passwordReset).toBe(true)
    expect(await status()).toEqual({ needsAdmin: false, passwordReset: true })
  })
})

describe('asking for a reset link', () => {
  it('answers the same for an unknown address as for a known one, and mails only the known one', async () => {
    const { sent, mailer } = recordingMailer()
    const { requestReset } = await serve({ mailer })
    const unknown = await requestReset('nobody@example.com')
    const known = await requestReset('root@example.com')
    expect(unknown.status).toBe(known.status)
    expect(await unknown.json()).toEqual(await known.json())
    expect(sent.map((message) => message.to)).toEqual(['root@example.com'])
  })

  it('answers before the mail is sent, so a slow or failing server tells nothing either', async () => {
    let finish = () => {}
    const sending = new Promise<void>((resolve) => (finish = resolve))
    const { requestReset } = await serve({ mailer: { send: () => sending.then(() => { throw new Error('relay refused') }) } })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect((await requestReset('root@example.com')).status).toBe(200)
    finish()
  })
})

describe('resetEmail', () => {
  it('is plain and short: the link, how long it works, and that it can be ignored', () => {
    const url = `${origin}/api/auth/reset-password/abc?callbackURL=x`
    const message = resetEmail({ to: 'root@example.com', url })
    expect(message).toMatchObject({ to: 'root@example.com', subject: 'Reset your password' })
    expect(message.text).toContain(`\n${url}\n`)
    expect(message.text).toContain('works for 1 hour')
    expect(message.text).toContain('If you did not ask for this, ignore this email')
  })
})
