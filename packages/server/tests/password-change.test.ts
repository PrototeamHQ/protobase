import { Kysely } from 'kysely'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { betterAuthAuthenticator } from '../src/better-auth/authenticator'
import { createAuth } from '../src/better-auth/create-auth'
import { createUser } from '../src/better-auth/users'
import { createAdmin } from '../src/create-admin'
import type { MailMessage } from '../src/mail/smtp-mailer'
import { openSnapshotDb, type SnapshotDb } from '../../../test-support/sql-snapshot'

// Real scrypt hashing runs on this thread, CPU work a busy machine stretches past 5 s.
vi.setConfig({ testTimeout: 30_000 })

const origin = 'http://localhost:5173'
const secret = 'test-secret-test-secret-test-secret-1234'
const password = 'correct horse battery'
const newPassword = 'another correct horse'

let shared: SnapshotDb
let appDb: Kysely<any>
beforeAll(async () => {
  shared = await openSnapshotDb('auth')
  appDb = new Kysely<any>({ dialect: shared.dialect })
})

// Every request comes from a new client address, so only the limit on the account can refuse one.
let client = 0

const serve = async () => {
  const store = await shared.clone()
  const sent: MailMessage[] = []
  const auth = createAuth({ database: { dialect: store.dialect, type: 'postgres' }, baseURL: origin, secret, mailer: { send: async (message) => void sent.push(message) } })
  await createUser(auth, { email: 'root@example.com', password })
  await createUser(auth, { email: 'sanne@example.com', password, role: 'user' })
  const app = createAdmin({ resources: [], db: appDb, authenticate: betterAuthAuthenticator({ auth }), auth })
  const request = (path: string, init: { body?: unknown; cookie?: string } = {}) =>
    app.request(`${origin}/api/auth${path}`, {
      method: init.body === undefined ? 'GET' : 'POST',
      headers: { 'content-type': 'application/json', origin, 'x-forwarded-for': `198.51.100.${++client % 250}`, ...(init.cookie && { cookie: init.cookie }) },
      ...(init.body !== undefined && { body: JSON.stringify(init.body) }),
    })
  const cookiesOf = (response: Response) =>
    response.headers.getSetCookie().map((line) => line.split(';')[0]!).filter((pair) => !pair.endsWith('=')).join('; ')
  const signIn = async (email: string) => {
    const response = await request('/sign-in/email', { body: { email, password } })
    expect(response.status).toBe(200)
    return cookiesOf(response)
  }
  const sessionOf = async (cookie: string) => (await request('/get-session', { cookie })).json()
  return { sent, request, cookiesOf, signIn, sessionOf }
}

describe('changing the password', () => {
  it('signs out the other devices though it was not asked to, keeps this one, and mails the owner', async () => {
    const { sent, request, cookiesOf, signIn, sessionOf } = await serve()
    const here = await signIn('sanne@example.com')
    const elsewhere = await signIn('sanne@example.com')
    const changed = await request('/change-password', { cookie: here, body: { currentPassword: password, newPassword, revokeOtherSessions: false } })
    expect(changed.status).toBe(200)
    expect(await sessionOf(elsewhere)).toBeNull()
    expect(await sessionOf(cookiesOf(changed))).toMatchObject({ user: { email: 'sanne@example.com' } })
    await expect.poll(() => sent.length, { timeout: 10_000 }).toBe(1)
    expect(sent[0]).toMatchObject({ to: 'sanne@example.com', subject: 'Your Protobase password was changed' })
  })

  it('refuses the current-password checks of an account over five a minute, from whichever address, and no other account', async () => {
    const { sent, request, signIn } = await serve()
    const cookie = await signIn('sanne@example.com')
    const statuses: number[] = []
    for (let guess = 1; guess <= 10; guess++) {
      statuses.push((await request('/change-password', { cookie, body: { currentPassword: `wrong guess ${guess}`, newPassword } })).status)
    }
    expect(statuses).toEqual([400, 400, 400, 400, 400, 429, 429, 429, 429, 429])
    const refused = await request('/change-password', { cookie, body: { currentPassword: password, newPassword } })
    expect(refused.status).toBe(429)
    expect(await refused.json()).toMatchObject({ code: 'TOO_MANY_PASSWORD_CHECKS' })
    expect(refused.headers.get('x-retry-after')).toMatch(/^\d+$/)

    const other = await signIn('root@example.com')
    expect((await request('/change-password', { cookie: other, body: { currentPassword: password, newPassword } })).status).toBe(200)
    await expect.poll(() => sent.length, { timeout: 10_000 }).toBe(1)
    expect(sent[0]!.to).toBe('root@example.com')
  })
})
