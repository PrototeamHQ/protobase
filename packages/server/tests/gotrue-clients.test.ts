import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { decodeProtectedHeader } from 'jose'
import { Kysely } from 'kysely'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { apiKeyCaller } from '../src/api-keys/resolve-caller'
import { jwtVerifier } from '../src/auth/jwt'
import { betterAuthAuthenticator } from '../src/better-auth/authenticator'
import { createAuth } from '../src/better-auth/create-auth'
import { createUser } from '../src/better-auth/users'
import { createAdmin } from '../src/create-admin'
import { goTrueTokens } from '../src/gotrue/access-tokens'
import type { MailMessage } from '../src/mail/smtp-mailer'
import { openSnapshotDb, type SnapshotDb } from '../../../test-support/sql-snapshot'

// Real scrypt hashing runs on this thread, CPU work a busy machine stretches past 5 s.
vi.setConfig({ testTimeout: 30_000 })

// supabase-js and @supabase/ssr as an app moving from Supabase uses them, against the app's /api/sb/auth/v1.
const origin = 'http://localhost:5173'
const secret = 'test-secret-test-secret-test-secret-1234'
const publishable = 'sb_publishable_test'
const password = 'correct horse battery'

let store: SnapshotDb
beforeAll(async () => {
  store = await openSnapshotDb('auth')
  await store.exec('alter table "user" add column raw_user_meta_data jsonb')
  // React Email and the templates load with the first auth email; render one here, so no test pays for that load.
  await (await import('../src/better-auth/auth-mail/auth-emails')).accountExistsEmail.render({ app: { name: 'Protobase', url: `${origin}/` } })
}, 60_000)

// Better Auth's rate limits are per client address and kept in memory, so every app gets an address of its own.
let client = 0

const serve = async () => {
  const db = await store.clone()
  const sent: MailMessage[] = []
  const auth = createAuth({
    database: { dialect: db.dialect, type: 'postgres' },
    baseURL: origin,
    secret,
    roles: ['admin', 'member'],
    signUp: { role: 'member' },
    users: { metadata: 'raw_user_meta_data' },
    mailer: { send: async (message) => void sent.push(message) },
  })
  await createUser(auth, { email: 'root@example.com', password })
  const app = createAdmin({ resources: [], db: new Kysely<any>({ dialect: db.dialect }), authenticate: betterAuthAuthenticator({ auth }), auth })
  const address = `192.0.2.${++client}`
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => app.request(input instanceof Request ? input : String(input), init)
  const options = { global: { fetch, headers: { 'x-forwarded-for': address } }, auth: { persistSession: false, autoRefreshToken: false } }
  // Mail goes out after the answer: wait for the code mailed to `to`.
  const codeFor = async (to: string) => {
    await expect.poll(() => sent.some((mail) => mail.to === to), { timeout: 10_000 }).toBe(true)
    const code = /^\d{6}$/m.exec(sent.findLast((mail) => mail.to === to)!.text)?.[0]
    if (!code) throw new Error(`No code mailed to ${to}`)
    sent.length = 0
    return code
  }
  return { auth, app, fetch, options, codeFor }
}

describe('supabase-js on the GoTrue-compatible endpoints', () => {
  it('signs up with an emailed code, reads the user and its claims, refreshes and signs out', async () => {
    const { auth, app, options, codeFor } = await serve()
    const supabase = createClient(`${origin}/api/sb`, publishable, options)

    const signUp = await supabase.auth.signUp({ email: 'ann@example.com', password, options: { data: { full_name: 'Ann' } } })
    expect(signUp.error).toBeNull()
    expect(signUp.data.session).toBeNull()
    const verified = await supabase.auth.verifyOtp({ email: 'ann@example.com', token: await codeFor('ann@example.com'), type: 'signup' })
    expect(verified.error).toBeNull()
    const session = verified.data.session!
    expect(session.refresh_token).toBeTruthy()
    expect(decodeProtectedHeader(session.access_token).alg).toBe('ES256')

    const { data: user } = await supabase.auth.getUser()
    expect(user.user).toMatchObject({ email: 'ann@example.com', role: 'authenticated', user_metadata: { full_name: 'Ann' }, app_metadata: { provider: 'email', providers: ['email'] } })
    expect(user.user!.email_confirmed_at).toBe('2026-08-01T00:00:00.000Z')
    const { data: claims, error } = await supabase.auth.getClaims()
    expect(error).toBeNull()
    expect(claims!.claims).toMatchObject({ sub: user.user!.id, role: 'authenticated', aud: 'authenticated', aal: 'aal1', email: 'ann@example.com', iss: `${origin}/api/sb/auth/v1` })

    // The access token is the signed-in user's on a request with the publishable key, and never one of Protobase's own.
    const caller = apiKeyCaller({ keys: { publishable }, verify: jwtVerifier(goTrueTokens({ auth })) })
    const bearer = { apikey: publishable, authorization: `Bearer ${session.access_token}` }
    expect(await caller(new Request(`${origin}/api/sb/rest/v1/notes`, { headers: bearer }))).toMatchObject({ role: 'authenticated', claims: { sub: user.user!.id } })
    expect((await app.request(`${origin}/api/meta`, { headers: { authorization: bearer.authorization } })).status).toBe(401)

    const refreshed = await supabase.auth.refreshSession()
    expect(refreshed.error).toBeNull()
    expect(refreshed.data.session!.refresh_token).not.toBe(session.refresh_token)
    const reused = await createClient(`${origin}/api/sb`, publishable, options).auth.refreshSession({ refresh_token: session.refresh_token })
    expect(reused.error).toMatchObject({ code: 'refresh_token_not_found' })

    const fresh = refreshed.data.session!.access_token
    expect((await supabase.auth.signOut()).error).toBeNull()
    expect((await supabase.auth.getUser(fresh)).error).toMatchObject({ name: 'AuthSessionMissingError' })
  })

  it('signs in an existing user with an emailed code, and refuses a wrong password', async () => {
    const { options, codeFor } = await serve()
    const supabase = createClient(`${origin}/api/sb`, publishable, options)
    expect((await supabase.auth.signInWithPassword({ email: 'root@example.com', password: 'not the password' })).error).toMatchObject({ code: 'invalid_credentials' })

    expect((await supabase.auth.signInWithOtp({ email: 'root@example.com' })).error).toBeNull()
    const { data, error } = await supabase.auth.verifyOtp({ email: 'root@example.com', token: await codeFor('root@example.com'), type: 'email' })
    expect(error).toBeNull()
    expect(data.user).toMatchObject({ email: 'root@example.com', role: 'authenticated' })
  })
})

describe('@supabase/ssr on the GoTrue-compatible endpoints', () => {
  it('keeps the session in cookies that a later request reads the user and claims from', async () => {
    const { fetch } = await serve()
    const jar = new Map<string, string>()
    const serverClient = () =>
      createServerClient(`${origin}/api/sb`, publishable, {
        global: { fetch, headers: { 'x-forwarded-for': '198.51.100.1' } },
        cookies: {
          getAll: () => [...jar].map(([name, value]) => ({ name, value })),
          setAll: (cookies: { name: string; value: string }[]) => cookies.forEach(({ name, value }) => (value ? jar.set(name, value) : jar.delete(name))),
        },
      })

    const signedIn = await serverClient().auth.signInWithPassword({ email: 'root@example.com', password })
    expect(signedIn.error).toBeNull()
    expect(signedIn.data.session?.refresh_token).toBeTruthy()
    expect(jar.size).toBeGreaterThan(0)

    const later = serverClient()
    const { data: user, error } = await later.auth.getUser()
    expect(error).toBeNull()
    expect(user.user!.email).toBe('root@example.com')
    const { data: claims } = await later.auth.getClaims()
    expect(claims!.claims).toMatchObject({ email: 'root@example.com', role: 'authenticated' })
  })
})
