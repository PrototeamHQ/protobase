import { Kysely } from 'kysely'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { betterAuthAuthenticator } from '../src/better-auth/authenticator'
import { createAuth, type CreateAuthOptions } from '../src/better-auth/create-auth'
import { createUser } from '../src/better-auth/users'
import { createAdmin } from '../src/create-admin'
import type { MailMessage } from '../src/mail/smtp-mailer'
import type { MobileConfig } from '../src/mobile-config'
import { openSnapshotDb, type SnapshotDb } from '../../../test-support/sql-snapshot'

const label = 'https://erp-x1.protobase.net'
const custom = 'https://admin.shop.com'
const secret = 'test-secret-test-secret-test-secret-1234'
const password = 'correct horse battery'

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

const serve = async (options: Partial<CreateAuthOptions> = {}, mobile?: MobileConfig) => {
  const sent: MailMessage[] = []
  const mailer = { send: async (message: MailMessage) => void sent.push(message) }
  const auth = createAuth({ database: { dialect: (await shared.clone()).dialect, type: 'postgres' }, baseURL: label, secret, mailer, ...options })
  await createUser(auth, { email: 'root@example.com', password })
  const app = createAdmin({ resources: [], db: appDb, authenticate: betterAuthAuthenticator({ auth }), auth, ...(mobile && { mobile }) })
  const address = `203.0.113.${++client}`
  const post = (origin: string, path: string, body: object, headers: Record<string, string> = {}) =>
    app.request(`${origin}/api/auth${path}`, { method: 'POST', headers: { 'content-type': 'application/json', origin, 'x-forwarded-for': address, ...headers }, body: JSON.stringify(body) })
  return { auth, app, sent, post, address }
}

describe('an app on several origins', () => {
  it('reads its other origins from PROTOBASE_ORIGINS, and keeps baseURL as issuer', async () => {
    vi.stubEnv('PROTOBASE_ORIGINS', `${custom},${label}`)
    const { auth } = await serve()
    expect(auth.origins).toEqual([label, custom])
    expect(auth.issuer).toBe(label)
  })

  it('serves the origins that may use its passkeys at /.well-known/webauthn, on every origin', async () => {
    const { app } = await serve({ origins: [custom] })
    for (const origin of [label, custom]) {
      const response = await app.request(`${origin}/.well-known/webauthn`)
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ origins: [label, custom] })
    }
  })

  it('has no /.well-known/webauthn on one origin', async () => {
    const { app } = await serve({ origins: [] })
    expect((await app.request(`${label}/.well-known/webauthn`)).status).toBe(404)
  })

  it('mails a password reset link on the origin that asked for it, and on baseURL for another host', async () => {
    const { sent, post } = await serve({ origins: [custom] })
    // Mail goes out after the answer, so each request waits for its own before the next.
    for (const [index, origin] of [custom, label].entries()) {
      expect((await post(origin, '/request-password-reset', { email: 'root@example.com', redirectTo: `${origin}/?password-reset` })).status).toBe(200)
      await vi.waitFor(() => expect(sent).toHaveLength(index + 1), { timeout: 10_000 })
    }
    const links = sent.map((message) => /https?:\/\/\S+/.exec(message.text)![0])
    expect(links[0]).toMatch(new RegExp(`^${custom}/api/auth/reset-password/`))
    expect(decodeURIComponent(new URL(links[0]!).searchParams.get('callbackURL')!)).toBe(`${custom}/?password-reset`)
    expect(links[1]).toMatch(new RegExp(`^${label}/api/auth/reset-password/`))
  })

  it('lets browser code on one of its origins call the API on another, and leaves sign-in to Better Auth', async () => {
    vi.stubEnv('PROTOBASE_CORS_ORIGINS', '')
    const { app } = await serve({ origins: [custom] })
    const preflight = (path: string, origin: string) => app.request(`${label}${path}`, { method: 'OPTIONS', headers: { origin, 'access-control-request-method': 'GET' } })
    expect((await preflight('/api/meta', custom)).headers.get('access-control-allow-origin')).toBe(custom)
    expect((await preflight('/api/meta', 'https://evil.example.com')).headers.get('access-control-allow-origin')).toBeNull()
    expect((await app.request(`${label}/api/auth/status`, { headers: { origin: custom } })).headers.get('access-control-allow-origin')).toBeNull()
  })

  it('signs in on another origin with a session for that host and a token the API takes, issued by baseURL', async () => {
    const { app, post } = await serve({ origins: [custom] })
    const signIn = await post(custom, '/sign-in/email', { email: 'root@example.com', password })
    expect(signIn.status).toBe(200)
    const cookie = signIn.headers.getSetCookie().map((header) => header.split(';')[0]).join('; ')
    const { token } = await (await app.request(`${custom}/api/auth/token`, { headers: { cookie } })).json()
    const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
    expect(claims).toMatchObject({ iss: label, aud: label })
    expect((await app.request(`${custom}/api/meta`, { headers: { authorization: `Bearer ${token}` } })).status).toBe(200)
  })
})

describe('a mobile app', () => {
  const mobile = { appId: 'com.example.shop' }
  const capacitor = ['capacitor://localhost', 'https://localhost']
  const corsHeaders = (response: Response) => [...response.headers.keys()].filter((name) => name.startsWith('access-control-'))

  it('leaves sign-in to Better Auth, which answers the Capacitor origins as it does without a mobile section', async () => {
    vi.stubEnv('PROTOBASE_CORS_ORIGINS', '')
    const answers = async (withMobile?: MobileConfig) => {
      const { app, address } = await serve({}, withMobile)
      const statuses: number[] = []
      for (const origin of capacitor) {
        for (const path of ['/api/auth/sign-in/email', '/api/auth/get-session', '/api/auth', '/api/auth/status']) {
          const headers = { origin, 'x-forwarded-for': address }
          const preflight = await app.request(`${label}${path}`, { method: 'OPTIONS', headers: { ...headers, 'access-control-request-method': 'POST' } })
          const method = path === '/api/auth/sign-in/email' ? 'POST' : 'GET'
          const body = method === 'POST' ? JSON.stringify({ email: 'root@example.com', password }) : undefined
          const request = await app.request(`${label}${path}`, { method, headers: { ...headers, 'content-type': 'application/json' }, body })
          expect(corsHeaders(preflight), `${origin} ${path}`).toEqual([])
          expect(corsHeaders(request), `${origin} ${path}`).toEqual([])
          statuses.push(preflight.status, request.status)
        }
      }
      return statuses
    }
    expect(await answers(mobile)).toEqual(await answers())
  })

  it('answers the Capacitor origins and the app\'s own on /api and /auth/v1', async () => {
    vi.stubEnv('PROTOBASE_CORS_ORIGINS', '')
    const { app } = await serve({ origins: [custom] }, mobile)
    for (const origin of [...capacitor, custom]) {
      for (const path of ['/api/meta', '/api/sb/auth/v1/user']) {
        const preflight = await app.request(`${label}${path}`, { method: 'OPTIONS', headers: { origin, 'access-control-request-method': 'GET', 'access-control-request-headers': 'authorization' } })
        expect(preflight.headers.get('access-control-allow-origin'), `${origin} ${path}`).toBe(origin)
        const response = await app.request(`${label}${path}`, { headers: { origin } })
        expect(response.headers.get('access-control-allow-origin'), `${origin} ${path}`).toBe(origin)
        expect(response.headers.get('access-control-allow-credentials')).toBeNull()
      }
    }
  })

  it('takes no session cookie from a Capacitor origin: only a bearer token signs the caller in', async () => {
    vi.stubEnv('PROTOBASE_CORS_ORIGINS', '')
    const { app, post } = await serve({}, mobile)
    const signIn = await post(label, '/sign-in/email', { email: 'root@example.com', password })
    const cookie = signIn.headers.getSetCookie().map((header) => header.split(';')[0]).join('; ')
    expect(cookie).toContain('session_token')
    const origin = 'https://localhost'
    expect((await app.request(`${label}/api/meta`, { headers: { origin, cookie } })).status).toBe(401)
    expect((await app.request(`${label}/api/sb/auth/v1/user`, { headers: { origin, cookie } })).status).toBe(401)
    const put = await app.request(`${label}/api/sb/auth/v1/user`, { method: 'PUT', headers: { origin, cookie, 'content-type': 'text/plain' }, body: JSON.stringify({ data: { name: 'Mallory' } }) })
    expect(put.status).toBe(401)
  })
})
