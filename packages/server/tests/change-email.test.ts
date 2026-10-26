import { Kysely } from 'kysely'
import { beforeAll, describe, expect, it } from 'vitest'
import { betterAuthAuthenticator } from '../src/better-auth/authenticator'
import { createAuth, type CreateAuthOptions } from '../src/better-auth/create-auth'
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

// Every app gets a copy of the migrated store, with two people, and keeps the mail it sends.
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
  // Asks for a code to `newEmail` and reads it from the mail that went there.
  const requestCode = async (cookie: string, newEmail: string) => {
    const before = sent.length
    expect((await request('/email-otp/request-email-change', { cookie, body: { newEmail } })).status).toBe(200)
    await expect.poll(() => sent.length, { timeout: 10_000 }).toBe(before + 1)
    const mail = sent[before]!
    return { mail, code: /^\d{6}$/m.exec(mail.text)![0] }
  }
  const status = async () => (await request('/status')).json()
  return { auth, sent, request, signIn, requestCode, status }
}

describe('changing the address', () => {
  it('moves the account to the new address once the code mailed there is right, and keeps it signed in', async () => {
    const { request, signIn, requestCode, status } = await serve()
    expect(await status()).toMatchObject({ changeEmail: true })
    expect((await request('/email-otp/request-email-change', { body: { newEmail: 'sanne@new.example' } })).status).toBe(401)
    const cookie = await signIn('sanne@example.com')

    const { mail, code } = await requestCode(cookie, 'Sanne@New.example')
    expect(mail.to).toBe('sanne@new.example')
    expect(mail.subject).toBe(`${code} confirms your new Protobase address`)
    const wrong = await request('/email-otp/change-email', { cookie, body: { newEmail: 'sanne@new.example', otp: code === '000000' ? '111111' : '000000' } })
    expect(wrong.status).toBe(400)
    expect(await wrong.json()).toMatchObject({ code: 'INVALID_OTP' })

    expect((await request('/email-otp/change-email', { cookie, body: { newEmail: 'sanne@new.example', otp: code } })).status).toBe(200)
    expect(await (await request('/get-session', { cookie })).json()).toMatchObject({ user: { email: 'sanne@new.example', emailVerified: true } })
    expect((await request('/sign-in/email', { body: { email: 'sanne@example.com', password } })).status).toBe(401)
    await signIn('sanne@new.example')
  })

  it('mails no code to an address another account has, and refuses the same address', async () => {
    const { request, sent, signIn } = await serve()
    const cookie = await signIn('sanne@example.com')
    expect((await request('/email-otp/request-email-change', { cookie, body: { newEmail: 'root@example.com' } })).status).toBe(200)
    expect((await request('/email-otp/change-email', { cookie, body: { newEmail: 'root@example.com', otp: '123456' } })).status).toBe(400)
    expect((await request('/email-otp/request-email-change', { cookie, body: { newEmail: 'sanne@example.com' } })).status).toBe(400)
    expect(sent).toEqual([])
  })

  it('asks for at most 3 codes a minute', async () => {
    const { request, signIn } = await serve()
    const cookie = await signIn('sanne@example.com')
    const asks = []
    for (const newEmail of ['a@new.example', 'b@new.example', 'c@new.example', 'd@new.example']) asks.push((await request('/email-otp/request-email-change', { cookie, body: { newEmail } })).status)
    expect(asks).toEqual([200, 200, 200, 429])
  })

  it('is not offered without mail', async () => {
    const { request, signIn, status } = await serve({ mailer: undefined })
    expect(await status()).not.toHaveProperty('changeEmail')
    expect((await request('/email-otp/request-email-change', { cookie: await signIn('sanne@example.com'), body: { newEmail: 'sanne@new.example' } })).status).toBe(404)
  })
})
