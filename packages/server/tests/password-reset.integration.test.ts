import type { AddressInfo } from 'node:net'
import { PGlite } from '@electric-sql/pglite'
import { Kysely } from 'kysely'
import { PGliteDialect } from 'kysely-pglite-dialect'
import { SMTPServer } from 'smtp-server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { betterAuthAuthenticator } from '../src/better-auth/authenticator'
import { createAuth } from '../src/better-auth/create-auth'
import { createUser } from '../src/better-auth/users'
import { createAdmin } from '../src/create-admin'
import { createAuthStore } from '../../../test-support/auth'

const origin = 'http://localhost:5173'
const oldPassword = 'correct horse battery'
const newPassword = 'a much longer new password'
const credential = { username: 'tenant-acme', password: 'relay-s3cret' }
const sender = 'noreply@acme.example.com'

type Received = { from: string; to: string[]; user: string | undefined; raw: string }

// An SMTP server in this process, as the platform's relay: it asks for the tenant's credential and keeps every message.
const startFakeRelay = async () => {
  const received: Received[] = []
  const waiting: Array<(message: Received) => void> = []
  const server = new SMTPServer({
    disabledCommands: ['STARTTLS'],
    allowInsecureAuth: true,
    onAuth: (auth, _session, callback) =>
      auth.username === credential.username && auth.password === credential.password ? callback(null, { user: auth.username }) : callback(new Error('Invalid credentials')),
    onData: (stream, session, callback) => {
      const chunks: Buffer[] = []
      stream.on('data', (chunk: Buffer) => chunks.push(chunk))
      stream.on('end', () => {
        const message = {
          from: session.envelope.mailFrom ? session.envelope.mailFrom.address : '',
          to: session.envelope.rcptTo.map((rcpt) => rcpt.address),
          user: session.user,
          raw: Buffer.concat(chunks).toString(),
        }
        const waiter = waiting.shift()
        if (waiter) waiter(message)
        else received.push(message)
        callback()
      })
    },
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.server.address() as AddressInfo).port
  const next = () => {
    const ready = received.shift()
    return ready ? Promise.resolve(ready) : new Promise<Received>((resolve) => waiting.push(resolve))
  }
  return { port, next, received, close: () => new Promise<void>((resolve) => server.close(() => resolve())) }
}

// Long lines of a plain-text body are sent quoted-printable: undo the soft line breaks and `=XX` escapes.
const decodeQuotedPrintable = (text: string) => text.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))

const bodyOf = (raw: string) => decodeQuotedPrintable(raw.slice(raw.indexOf('\r\n\r\n') + 4))

let relay: Awaited<ReturnType<typeof startFakeRelay>>
let store: PGlite
let app: ReturnType<typeof createAdmin>

beforeAll(async () => {
  relay = await startFakeRelay()
  // As the platform passes them to a tenant's container.
  vi.stubEnv('PROTOBASE_SMTP_URL', `smtp://${credential.username}:${credential.password}@127.0.0.1:${relay.port}`)
  vi.stubEnv('PROTOBASE_MAIL_FROM', sender)
  store = await createAuthStore()
  const auth = createAuth({ database: { dialect: new PGliteDialect(store), type: 'postgres' }, baseURL: origin, secret: 'test-secret-test-secret-test-secret-1234', signInPerMinute: 100 })
  vi.unstubAllEnvs()
  await createUser(auth, { email: 'sanne@acme.example.com', password: oldPassword })
  // The app has no resources and never queries its database, so it shares the store instead of a fresh PGlite.
  app = createAdmin({ resources: [], db: new Kysely<any>({ dialect: new PGliteDialect(store) }), authenticate: betterAuthAuthenticator({ auth }), auth })
})
afterAll(async () => { await relay.close() })

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  app.request(`${origin}/api/auth${path}`, { method: 'POST', headers: { 'content-type': 'application/json', origin, ...headers }, body: JSON.stringify(body) })

const signIn = (password: string) => post('/sign-in/email', { email: 'sanne@acme.example.com', password })

const cookieOf = (response: Response) => response.headers.getSetCookie().map((line) => line.split(';')[0]).join('; ')

const linkIn = async () => {
  const message = await relay.next()
  const link = /https?:\/\/\S+\/reset-password\/\S+/.exec(bodyOf(message.raw))?.[0]
  if (!link) throw new Error(`No reset link in the email:\n${message.raw}`)
  return { message, link }
}

describe('password reset over SMTP', () => {
  it('requests a link, mails it through the relay, follows it, sets the new password and signs in with it', async () => {
    const before = await signIn(oldPassword)
    expect(before.status).toBe(200)
    const oldSession = cookieOf(before)

    expect(await (await app.request(`${origin}/api/auth/status`)).json()).toEqual({ needsAdmin: false, passwordReset: true })
    const requested = await post('/request-password-reset', { email: 'sanne@acme.example.com', redirectTo: `${origin}/orders?password-reset` })
    expect(requested.status).toBe(200)

    const { message, link } = await linkIn()
    expect(message).toMatchObject({ from: sender, to: ['sanne@acme.example.com'], user: credential.username })
    expect(message.raw).toContain('Subject: Reset your password')
    expect(bodyOf(message.raw)).toContain('The link works for 1 hour, once.')
    expect(link.startsWith(`${origin}/api/auth/reset-password/`)).toBe(true)

    const followed = await app.request(link)
    expect(followed.status).toBe(302)
    const landing = new URL(followed.headers.get('location')!)
    expect(`${landing.origin}${landing.pathname}`).toBe(`${origin}/orders`)
    expect(landing.searchParams.has('password-reset')).toBe(true)
    const token = landing.searchParams.get('token')!
    expect(token).toBeTruthy()

    expect((await post('/reset-password', { token, newPassword })).status).toBe(200)
    expect((await signIn(oldPassword)).status).toBe(401)
    expect((await signIn(newPassword)).status).toBe(200)

    const stale = await app.request(`${origin}/api/auth/get-session`, { headers: { cookie: oldSession, origin } })
    expect(await stale.json()).toBeNull()

    const again = await post('/reset-password', { token, newPassword: 'yet another new password' })
    expect(again.status).toBe(400)
    expect(await again.json()).toMatchObject({ code: 'INVALID_TOKEN' })
  })

  it('mails nothing for an unknown address, and an expired link lands on the page with error=INVALID_TOKEN', async () => {
    expect((await post('/request-password-reset', { email: 'nobody@acme.example.com', redirectTo: `${origin}/?password-reset` })).status).toBe(200)
    expect((await post('/request-password-reset', { email: 'sanne@acme.example.com', redirectTo: `${origin}/?password-reset` })).status).toBe(200)
    const { message, link } = await linkIn()
    expect(message.to).toEqual(['sanne@acme.example.com'])
    expect(relay.received).toEqual([])

    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() + 61 * 60_000 })
    const followed = await app.request(link)
    vi.useRealTimers()
    const landing = new URL(followed.headers.get('location')!)
    expect(landing.searchParams.get('error')).toBe('INVALID_TOKEN')
    expect(landing.searchParams.has('token')).toBe(false)
  })
})
