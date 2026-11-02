import { createHmac } from 'node:crypto'
import { Kysely } from 'kysely'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { betterAuthAuthenticator } from '../src/better-auth/authenticator'
import { createAuth } from '../src/better-auth/create-auth'
import { createUser } from '../src/better-auth/users'
import { createAdmin } from '../src/create-admin'
import type { MailMessage } from '../src/mail/smtp-mailer'
import type { MobileConfig } from '../src/mobile-config'
import { openSnapshotDb, type SnapshotDb } from '../../../test-support/sql-snapshot'

// The app's iOS and Android build signs in through native HTTP at `/api/auth`, naming its Capacitor origin. With a
// mobile section, `createAdmin`'s mount has Better Auth trust that origin for that request alone: nothing else does.

const label = 'https://erp-x1.protobase.net'
const secret = 'test-secret-test-secret-test-secret-1234'
const password = 'correct horse battery'
const capacitor = ['capacitor://localhost', 'https://localhost']
const mobile: MobileConfig = { appId: 'com.example.shop' }

let shared: SnapshotDb
let appDb: Kysely<any>
beforeAll(async () => {
  shared = await openSnapshotDb('auth')
  appDb = new Kysely<any>({ dialect: shared.dialect })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

// Better Auth's rate limits are per client address, so every app gets an address of its own.
let client = 0

const serve = async (withMobile?: MobileConfig) => {
  const sent: MailMessage[] = []
  const mailer = { send: async (message: MailMessage) => void sent.push(message) }
  const auth = createAuth({ database: { dialect: (await shared.clone()).dialect, type: 'postgres' }, baseURL: label, secret, mailer })
  // Better Auth skips its origin check under a test runner, so it is turned back on here.
  ;(await auth.$context).skipOriginCheck = false
  await createUser(auth, { email: 'root@example.com', password })
  const app = createAdmin({ resources: [], db: appDb, authenticate: betterAuthAuthenticator({ auth }), auth, ...(withMobile && { mobile: withMobile }) })
  const address = `203.0.113.${++client}`
  const headersFrom = (origin: string | undefined, cookie: string) => ({ 'content-type': 'application/json', 'x-forwarded-for': address, ...(origin && { origin }), ...(cookie && { cookie }) })
  const post = (origin: string | undefined, path: string, body: object, cookie = '') =>
    app.request(`${label}/api/auth${path}`, { method: 'POST', headers: headersFrom(origin, cookie), body: JSON.stringify(body) })
  const get = (origin: string | undefined, path: string, cookie: string) => app.request(`${label}/api/auth${path}`, { headers: headersFrom(origin, cookie) })
  // A request in the shape `init` gives, from an address of its own, so the sign-in rate limit never answers for it.
  const rawPost = (origin: string, path: string, init: { headers?: Record<string, string>; body?: BodyInit }, cookie = '') =>
    app.request(`${label}/api/auth${path}`, { method: 'POST', body: init.body, headers: { ...init.headers, 'x-forwarded-for': `203.0.113.${++client}`, origin, ...(cookie && { cookie }) } })
  const mailedCode = async () => {
    await vi.waitFor(() => expect(sent.length).toBeGreaterThan(0), { timeout: 10_000 })
    const code = /\b\d{6}\b/.exec(sent.shift()!.text)?.[0]
    if (!code) throw new Error('No code in the email')
    return code
  }
  const signInWithCode = async (origin: string, email = 'root@example.com') => {
    expect((await post(origin, '/email-otp/send-verification-otp', { email, type: 'sign-in' })).status).toBe(200)
    return post(origin, '/sign-in/email-otp', { email, otp: await mailedCode() })
  }
  return { auth, app, post, get, rawPost, signInWithCode, address }
}

// The cookies the device's cookie jar keeps from a response; a cookie the response clears is left out.
const cookiesOf = (response: Response) =>
  response.headers.getSetCookie().map((line) => line.split(';')[0]!).filter((pair) => !pair.endsWith('=')).join('; ')

const sessionCookieLine = (response: Response) => response.headers.getSetCookie().find((line) => /^(__Secure-)?better-auth\.session_token=[^;]/.test(line))

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

const corsHeaders = (response: Response) => [...response.headers.keys()].filter((name) => name.startsWith('access-control-'))

describe('a mobile app signing in from its Capacitor origin', () => {
  it.each(capacitor)('signs in with an emailed code from %s, gets a token the API takes, and signs out', async (origin) => {
    const { app, post, get, signInWithCode } = await serve(mobile)
    const signedIn = await signInWithCode(origin)
    expect(signedIn.status).toBe(200)
    expect(sessionCookieLine(signedIn)).toMatch(/;\s*SameSite=Lax/i)
    const cookie = cookiesOf(signedIn)

    const session = await get(origin, '/get-session', cookie)
    expect((await session.json()).user).toMatchObject({ email: 'root@example.com' })
    const { token } = await (await get(origin, '/token', cookie)).json()
    expect((await app.request(`${label}/api/meta`, { headers: { authorization: `Bearer ${token}` } })).status).toBe(200)

    expect((await post(origin, '/sign-out', {}, cookie)).status).toBe(200)
    // Signing out ends the session on the server, whichever origin presents the old cookie next.
    for (const from of capacitor) {
      expect(await (await get(from, '/get-session', cookie)).json()).toBeNull()
      expect((await get(from, '/token', cookie)).status).toBe(401)
    }
  })

  it('asks for the second step of an account with an authenticator app, and acts for no one before it', async () => {
    const { post, get, signInWithCode } = await serve(mobile)
    const origin = 'capacitor://localhost'
    const cookie = cookiesOf(await post(label, '/sign-in/email', { email: 'root@example.com', password }))
    const enabled = await post(label, '/two-factor/enable', { password, method: 'totp' }, cookie)
    const { totpURI } = (await enabled.json()) as { totpURI: string }
    expect((await post(label, '/two-factor/verify-totp', { code: authenticatorCode(totpURI) }, cookie)).status).toBe(200)

    const challenged = await signInWithCode(origin)
    expect(await challenged.json()).toEqual({ twoFactorRedirect: true, twoFactorMethods: ['totp', 'otp'] })
    const pending = cookiesOf(challenged)
    expect(pending).not.toContain('session_token')
    expect(await (await get(origin, '/get-session', pending)).json()).toBeNull()
    expect((await get(origin, '/token', pending)).status).toBe(401)

    const verified = await post(origin, '/two-factor/verify-totp', { code: authenticatorCode(totpURI) }, pending)
    expect(verified.status).toBe(200)
    const session = cookiesOf(verified)
    expect((await (await get(origin, '/get-session', session)).json()).user).toMatchObject({ email: 'root@example.com' })
    expect((await get(origin, '/token', session)).status).toBe(200)
  })
})

describe('the Capacitor origins at /api/auth', () => {
  it('are refused without a mobile section', async () => {
    const { post, get } = await serve()
    for (const origin of capacitor) {
      const sent = await post(origin, '/email-otp/send-verification-otp', { email: 'root@example.com', type: 'sign-in' })
      expect(sent.status, origin).toBe(403)
      expect(await sent.json()).toMatchObject({ code: 'INVALID_ORIGIN' })
    }
    const cookie = cookiesOf(await post(label, '/sign-in/email', { email: 'root@example.com', password }))
    for (const origin of capacitor) {
      const signOut = await post(origin, '/sign-out', {}, cookie)
      expect(signOut.status, origin).toBe(403)
      expect(await signOut.json()).toMatchObject({ code: 'INVALID_ORIGIN' })
    }
    expect((await get(label, '/get-session', cookie)).status).toBe(200)
  })

  it('give another origin, or none, no trust with a mobile section', async () => {
    const { post } = await serve(mobile)
    expect((await post('https://evil.example', '/email-otp/send-verification-otp', { email: 'root@example.com', type: 'sign-in' })).status).toBe(403)
    const cookie = cookiesOf(await post(label, '/sign-in/email', { email: 'root@example.com', password }))
    expect((await post('https://evil.example', '/sign-out', {}, cookie)).status).toBe(403)
    expect((await post(undefined, '/sign-out', {}, cookie)).status).toBe(403)
  })

  it('are refused by the instance itself: only the mobile mount trusts them', async () => {
    const { auth } = await serve(mobile)
    for (const origin of capacitor) {
      const response = await auth.handler(
        new Request(`${label}/api/auth/email-otp/send-verification-otp`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', origin, 'x-forwarded-for': '198.51.100.7' },
          body: JSON.stringify({ email: 'root@example.com', type: 'sign-in' }),
        }),
      )
      expect(response.status, origin).toBe(403)
      expect(await response.json()).toMatchObject({ code: 'INVALID_ORIGIN' })
    }
  })

  // A page can send a form, `text/plain` or multipart POST without a preflight. `/api/auth` answers no preflight and the
  // mobile mount takes a JSON body alone from a Capacitor origin, so a page in the app cannot use the grant.
  it('cannot be used by a page: a simple POST from a Capacitor origin is refused and sets no cookie', async () => {
    const { rawPost } = await serve(mobile)
    const credentials = { email: 'root@example.com', password }
    const text = JSON.stringify(credentials)
    const multipart = new FormData()
    multipart.set('email', credentials.email)
    multipart.set('password', password)
    const simple: [string, { headers?: Record<string, string>; body?: BodyInit }][] = [
      ['text', { headers: { 'content-type': 'text/plain;charset=UTF-8' }, body: text }],
      ['form', { headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(credentials).toString() }],
      ['multipart', { body: multipart }],
      ['untyped', { body: new Blob([text]) }],
      ['empty', {}],
    ]
    for (const origin of capacitor) {
      const control = await rawPost(origin, '/sign-in/email', { headers: { 'content-type': 'application/json' }, body: text })
      expect(control.status, origin).toBe(200)
      expect(sessionCookieLine(control), origin).toBeDefined()
      for (const path of ['/sign-in/email', '/sign-up/email', '/callback/credential']) {
        for (const [shape, init] of simple) {
          const refused = await rawPost(origin, path, init)
          expect(refused.status, `${origin} ${path} ${shape}`).toBe(415)
          expect(refused.headers.getSetCookie(), `${origin} ${path} ${shape}`).toEqual([])
          expect(corsHeaders(refused), `${origin} ${path} ${shape}`).toEqual([])
          expect(await refused.json()).toMatchObject({ code: 'UNSUPPORTED_MEDIA_TYPE' })
        }
      }
    }
  })

  it('refuse a page alike whatever its form says, and leave the session it carries alone', async () => {
    const { post, get, rawPost } = await serve(mobile)
    const origin = 'https://localhost'
    const form = (fields: Record<string, string>) => ({ headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields).toString() })
    const right = await rawPost(origin, '/sign-in/email', form({ email: 'root@example.com', password }))
    const wrong = await rawPost(origin, '/sign-in/email', form({ email: 'root@example.com', password: 'wrong password' }))
    expect([right.status, await right.text()]).toEqual([wrong.status, await wrong.text()])

    const cookie = cookiesOf(await post(label, '/sign-in/email', { email: 'root@example.com', password }))
    const before = await (await get(label, '/get-session', cookie)).json()
    const carried = await rawPost(origin, '/sign-in/email', form({ email: 'root@example.com', password }), cookie)
    expect(carried.status).toBe(415)
    expect(carried.headers.getSetCookie()).toEqual([])
    expect((await (await get(label, '/get-session', cookie)).json()).session.id).toBe(before.session.id)
  })

  it.each(['application/json; charset=utf-8', 'Application/Json'])('take a JSON body typed %j from the app', async (type) => {
    const { rawPost } = await serve(mobile)
    const signedIn = await rawPost('capacitor://localhost', '/sign-in/email', { headers: { 'content-type': type }, body: JSON.stringify({ email: 'root@example.com', password }) })
    expect(signedIn.status).toBe(200)
    expect(sessionCookieLine(signedIn)).toBeDefined()
  })

  it('leave a form sign-in from the app\'s own origin alone, with a mobile section or without', async () => {
    for (const withMobile of [mobile, undefined]) {
      const { rawPost } = await serve(withMobile)
      const signedIn = await rawPost(label, '/sign-in/email', { headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ email: 'root@example.com', password }).toString() })
      expect(signedIn.status, String(Boolean(withMobile))).toBe(200)
      expect(sessionCookieLine(signedIn)).toBeDefined()
    }
  })

  it('are a place to send a password reset link to only in a request from that very origin', async () => {
    const { post } = await serve(mobile)
    const fromApp = await post(label, '/request-password-reset', { email: 'root@example.com', redirectTo: 'https://localhost/x' })
    expect(fromApp.status).toBe(403)
    expect(await fromApp.json()).toMatchObject({ code: 'INVALID_REDIRECT_URL' })
    const elsewhere = await post('https://localhost', '/request-password-reset', { email: 'root@example.com', redirectTo: 'https://evil.example/x' })
    expect(elsewhere.status).toBe(403)
  })

  it('get no CORS headers, preflight included', async () => {
    vi.stubEnv('PROTOBASE_CORS_ORIGINS', '')
    const { app } = await serve(mobile)
    for (const origin of capacitor) {
      for (const path of ['/api/auth/email-otp/send-verification-otp', '/api/auth/get-session', '/api/auth/status']) {
        const preflight = await app.request(`${label}${path}`, { method: 'OPTIONS', headers: { origin, 'access-control-request-method': 'POST' } })
        const answer = await app.request(`${label}${path}`, { headers: { origin } })
        expect(corsHeaders(preflight), `${origin} ${path}`).toEqual([])
        expect(corsHeaders(answer), `${origin} ${path}`).toEqual([])
      }
    }
  })
})

describe('the GoTrue-compatible sign-in', () => {
  it('answers a Capacitor origin as it does without a mobile section', async () => {
    const answers = async (withMobile?: MobileConfig) => {
      const { app, address } = await serve(withMobile)
      const call = async (path: string, body: object) => {
        const headers = { 'content-type': 'application/json', origin: 'https://localhost', 'x-forwarded-for': address }
        const response = await app.request(`${label}/api/sb/auth/v1${path}`, { method: 'POST', headers, body: JSON.stringify(body) })
        return { status: response.status, body: await response.text() }
      }
      return [await call('/otp', { email: 'root@example.com' }), await call('/verify', { email: 'root@example.com', token: '000000', type: 'email' })]
    }
    expect(await answers(mobile)).toEqual(await answers())
  })
})
