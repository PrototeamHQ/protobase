import { createHmac } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { Kysely } from 'kysely'
import { PGliteDialect } from 'kysely-pglite-dialect'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { betterAuthAuthenticator } from '../src/better-auth/authenticator'
import { createAuth } from '../src/better-auth/create-auth'
import { createUser } from '../src/better-auth/users'
import { createAdmin } from '../src/create-admin'
import { createAuthStore } from '../../../test-support/auth'
import { bodyOf, startFakeRelay } from './support/fake-relay'

const origin = 'http://localhost:5173'
const password = 'correct horse battery'
const sender = 'noreply@acme.example.com'

let relay: Awaited<ReturnType<typeof startFakeRelay>>
let store: PGlite
let app: ReturnType<typeof createAdmin>

beforeAll(async () => {
  relay = await startFakeRelay()
  vi.stubEnv('PROTOBASE_SMTP_URL', relay.smtpUrl)
  vi.stubEnv('PROTOBASE_MAIL_FROM', sender)
  store = await createAuthStore()
  const auth = createAuth({ database: { dialect: new PGliteDialect(store), type: 'postgres' }, baseURL: origin, secret: 'test-secret-test-secret-test-secret-1234', appName: 'Acme ERP' })
  vi.unstubAllEnvs()
  for (const email of ['ada@acme.example.com', 'bob@acme.example.com', 'cy@acme.example.com']) await createUser(auth, { email, password })
  app = createAdmin({ resources: [], db: new Kysely<any>({ dialect: new PGliteDialect(store) }), authenticate: betterAuthAuthenticator({ auth }), auth })
})
afterAll(async () => { await relay.close() })

// Better Auth limits two-factor and code requests per client address; every request here comes from a new one.
let client = 0
const post = (path: string, body: unknown, cookie = '') =>
  app.request(`${origin}/api/auth${path}`, { method: 'POST', headers: { 'content-type': 'application/json', origin, cookie, 'x-forwarded-for': `198.51.100.${++client}` }, body: JSON.stringify(body) })
const get = (path: string, cookie: string) => app.request(`${origin}/api/auth${path}`, { headers: { origin, cookie } })

// The cookies a browser keeps from a response; a cookie the response clears is left out.
const cookiesOf = (response: Response) =>
  response.headers.getSetCookie().map((line) => line.split(';')[0]!).filter((pair) => !pair.endsWith('=')).join('; ')

const mailedCode = async (to: string, subject: string) => {
  const message = await relay.next()
  expect(message).toMatchObject({ from: sender, to: [to] })
  expect(message.raw).toContain(`Subject: ${subject}`)
  const code = /^\d{6}$/m.exec(bodyOf(message.raw))?.[0]
  if (!code) throw new Error(`No code in the email:\n${message.raw}`)
  return code
}

const base32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const decodeBase32 = (text: string) => {
  const bits = [...text].map((char) => base32.indexOf(char).toString(2).padStart(5, '0')).join('')
  return Buffer.from(Array.from({ length: Math.floor(bits.length / 8) }, (_, index) => parseInt(bits.slice(index * 8, index * 8 + 8), 2)))
}

// What an authenticator app shows for the otpauth:// URI it scanned (RFC 6238: HMAC-SHA1, 30 seconds, 6 digits).
const authenticatorCode = (uri: string) => {
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)))
  const hmac = createHmac('sha1', decodeBase32(new URL(uri).searchParams.get('secret')!)).update(counter).digest()
  return String((hmac.readUInt32BE(hmac[hmac.length - 1]! & 15) & 0x7fffffff) % 1_000_000).padStart(6, '0')
}

const signInWithPassword = (email: string) => post('/sign-in/email', { email, password })

const signInWithCode = async (email: string) => {
  expect((await post('/email-otp/send-verification-otp', { email, type: 'sign-in' })).status).toBe(200)
  return post('/sign-in/email-otp', { email, otp: await mailedCode(email, 'Your sign-in code') })
}

// Turns on two-factor authentication with an authenticator app, as the account page does; returns the scanned URI and the backup codes.
const turnOnAuthenticatorApp = async (email: string) => {
  const cookie = cookiesOf(await signInWithPassword(email))
  const enabled = await post('/two-factor/enable', { password, method: 'totp' }, cookie)
  expect(enabled.status).toBe(200)
  const { totpURI, backupCodes } = (await enabled.json()) as { totpURI: string; backupCodes: string[] }
  expect(totpURI).toMatch(/^otpauth:\/\/totp\/Acme%20ERP:/)
  expect(backupCodes).toHaveLength(10)
  expect((await post('/two-factor/verify-totp', { code: authenticatorCode(totpURI) }, cookie)).status).toBe(200)
  return { totpURI, backupCodes }
}

const expectSignedIn = async (response: Response) => {
  expect(response.status).toBe(200)
  const token = await get('/token', cookiesOf(response))
  expect(token.status).toBe(200)
  expect(await token.json()).toEqual({ token: expect.any(String) })
}

describe('signing in with an emailed code', () => {
  it('mails a code through the relay that signs in once', async () => {
    const response = await signInWithCode('ada@acme.example.com')
    await expectSignedIn(response)
    expect((await post('/email-otp/send-verification-otp', { email: 'nobody@acme.example.com', type: 'sign-in' })).status).toBe(200)
    expect(relay.received).toEqual([])
  })
})

describe('two-factor authentication', () => {
  it('asks for the authenticator app after a password, and signs in with its code', async () => {
    const { totpURI } = await turnOnAuthenticatorApp('bob@acme.example.com')
    const challenged = await signInWithPassword('bob@acme.example.com')
    expect(await challenged.json()).toEqual({ twoFactorRedirect: true, twoFactorMethods: ['totp', 'otp'] })
    const pending = cookiesOf(challenged)
    expect(pending).not.toContain('session_token')
    expect((await get('/token', pending)).status).toBe(401)
    expect((await post('/two-factor/verify-totp', { code: '000000' }, pending)).status).toBe(401)
    await expectSignedIn(await post('/two-factor/verify-totp', { code: authenticatorCode(totpURI) }, pending))
  })

  it('mails the second step instead when asked', async () => {
    const pending = cookiesOf(await signInWithPassword('bob@acme.example.com'))
    expect((await post('/two-factor/send-otp', {}, pending)).status).toBe(200)
    const code = await mailedCode('bob@acme.example.com', 'Your verification code')
    await expectSignedIn(await post('/two-factor/verify-otp', { code }, pending))
  })

  it('asks after an emailed sign-in code too, and takes a backup code once', async () => {
    const { backupCodes } = await turnOnAuthenticatorApp('cy@acme.example.com')
    const challenged = await signInWithCode('cy@acme.example.com')
    expect(await challenged.json()).toEqual({ twoFactorRedirect: true, twoFactorMethods: ['totp', 'otp'] })
    const pending = cookiesOf(challenged)
    await expectSignedIn(await post('/two-factor/verify-backup-code', { code: backupCodes[0] }, pending))

    const again = cookiesOf(await signInWithPassword('cy@acme.example.com'))
    expect((await post('/two-factor/verify-backup-code', { code: backupCodes[0] }, again)).status).toBe(401)
    await expectSignedIn(await post('/two-factor/verify-backup-code', { code: backupCodes[1] }, again))
  })
})
