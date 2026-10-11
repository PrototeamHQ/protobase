import type { PGlite } from '@electric-sql/pglite'
import { Kysely } from 'kysely'
import { PGliteDialect } from 'kysely-pglite-dialect'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { betterAuthAuthenticator } from '../src/better-auth/authenticator'
import { createAuth, type CreateAuthOptions } from '../src/better-auth/create-auth'
import { createUser } from '../src/better-auth/users'
import { createAdmin } from '../src/create-admin'
import type { MailMessage } from '../src/mail/smtp-mailer'
import { createAuthStore } from '../../../test-support/auth'

const label = 'https://erp-x1.protobase.net'
const custom = 'https://admin.shop.com'
const secret = 'test-secret-test-secret-test-secret-1234'
const password = 'correct horse battery'

let shared: PGlite
let appDb: Kysely<any>
beforeAll(async () => {
  shared = await createAuthStore()
  appDb = new Kysely<any>({ dialect: new PGliteDialect(shared) })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

// Better Auth's rate limits are per client address, so every app gets an address of its own.
let client = 0

const serve = async (options: Partial<CreateAuthOptions> = {}) => {
  const sent: MailMessage[] = []
  const mailer = { send: async (message: MailMessage) => void sent.push(message) }
  const auth = createAuth({ database: { dialect: new PGliteDialect((await shared.clone()) as PGlite), type: 'postgres' }, baseURL: label, secret, mailer, ...options })
  await createUser(auth, { email: 'root@example.com', password })
  const app = createAdmin({ resources: [], db: appDb, authenticate: betterAuthAuthenticator({ auth }), auth })
  const address = `203.0.113.${++client}`
  const post = (origin: string, path: string, body: object, headers: Record<string, string> = {}) =>
    app.request(`${origin}/api/auth${path}`, { method: 'POST', headers: { 'content-type': 'application/json', origin, 'x-forwarded-for': address, ...headers }, body: JSON.stringify(body) })
  return { auth, app, sent, post }
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
    for (const origin of [custom, label]) {
      expect((await post(origin, '/request-password-reset', { email: 'root@example.com', redirectTo: `${origin}/?password-reset` })).status).toBe(200)
    }
    await vi.waitFor(() => expect(sent).toHaveLength(2))
    const links = sent.map((message) => /https?:\/\/\S+/.exec(message.text)![0])
    expect(links[0]).toMatch(new RegExp(`^${custom}/api/auth/reset-password/`))
    expect(decodeURIComponent(new URL(links[0]!).searchParams.get('callbackURL')!)).toBe(`${custom}/?password-reset`)
    expect(links[1]).toMatch(new RegExp(`^${label}/api/auth/reset-password/`))
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
