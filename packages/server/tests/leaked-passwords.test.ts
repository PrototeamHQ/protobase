import { createHash } from 'node:crypto'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { betterAuthAuthenticator } from '../src/better-auth/authenticator'
import { createAuth } from '../src/better-auth/create-auth'
import { createUser } from '../src/better-auth/users'
import { createAdmin } from '../src/create-admin'
import { allResources, createFixtureDb } from '../../../test-support/server'
import { openSnapshotDb, settled } from '../../../test-support/sql-snapshot'

// Real scrypt hashing runs on this thread, CPU work a busy machine stretches past 5 s.
vi.setConfig({ testTimeout: 30_000 })

const origin = 'http://localhost:5173'
const secret = 'test-secret-test-secret-test-secret-1234'
const password = 'correct horse battery'
const leaked = 'password1234567'
const fresh = 'a fresh and unbreached one'

// Have I Been Pwned's range lookup, answering for `leaked` alone; each asked prefix is kept.
const asked: string[] = []
const lookup = (answer: (prefix: string) => Response) =>
  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    if (url.host !== 'api.pwnedpasswords.com') throw new Error(`Unexpected fetch of ${url}`)
    const prefix = url.pathname.split('/').at(-1)!
    asked.push(prefix)
    return answer(prefix)
  })
const sha1 = (text: string) => createHash('sha1').update(text).digest('hex').toUpperCase()
const corpus = (prefix: string) =>
  new Response(sha1(leaked).startsWith(prefix) ? `0018A45C4D1DEF81644B54AB7F969B88D65:1\r\n${sha1(leaked).slice(5)}:2413945\r\n` : '0018A45C4D1DEF81644B54AB7F969B88D65:0\r\n')

let fixture: Awaited<ReturnType<typeof createFixtureDb>>
beforeAll(async () => { fixture = await createFixtureDb() })
afterAll(async () => { await fixture.db.destroy() })
afterEach(() => {
  vi.unstubAllGlobals()
  asked.length = 0
})

let client = 0

/** An app with Root as its only admin and Plain as a user, checking new passwords when `leakedPasswords` says so. */
const serve = async (leakedPasswords: boolean) => {
  const store = await openSnapshotDb('auth')
  const auth = createAuth({ database: { dialect: store.dialect, type: 'postgres' }, baseURL: origin, secret, mailer: false, signInPerMinute: 100, leakedPasswords })
  await auth.$context
  await settled()
  const root = await createUser(auth, { email: 'root@example.com', password })
  const plain = await createUser(auth, { email: 'plain@example.com', password, role: 'user' })
  const app = createAdmin({ resources: allResources, db: fixture.db, authenticate: betterAuthAuthenticator({ auth, tenant: 1 }), auth })
  const address = `198.51.100.${++client}`
  const request = (path: string, init: { body?: unknown; cookie?: string } = {}) =>
    app.request(`${origin}/api/auth${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin, 'x-forwarded-for': address, ...(init.cookie && { cookie: init.cookie }) },
      body: JSON.stringify(init.body ?? {}),
    })
  const signIn = async (email: string) => {
    const response = await request('/sign-in/email', { body: { email, password } })
    expect(response.status).toBe(200)
    return response.headers.getSetCookie().map((line) => line.split(';')[0]).join('; ')
  }
  return { auth, request, signIn, plain }
}

describe('leaked passwords', () => {
  it('refuses a leaked password where one is set, changed or given by an admin, and takes another', async () => {
    lookup(corpus)
    const { auth, request, signIn, plain } = await serve(true)
    const cookie = await signIn('root@example.com')
    expect(asked).toEqual([sha1(password).slice(0, 5), sha1(password).slice(0, 5)])

    for (const [path, body] of [
      ['/change-password', { currentPassword: password, newPassword: leaked }],
      ['/admin/set-user-password', { userId: plain.id, newPassword: leaked }],
      ['/admin/create-user', { email: 'new@example.com', name: 'New', password: leaked, role: 'user' }],
    ] as const) {
      const response = await request(path, { body, cookie })
      expect(response.status).toBe(400)
      expect(await response.json()).toMatchObject({ code: 'PASSWORD_COMPROMISED', message: 'This password appears in a known data breach. Choose a different one.' })
    }
    await expect(createUser(auth, { email: 'host@example.com', password: leaked })).rejects.toMatchObject({ body: { code: 'PASSWORD_COMPROMISED' } })
    // Refused before anything is written: no account without a password is left behind.
    const { internalAdapter } = await auth.$context
    expect(await internalAdapter.findUserByEmail('new@example.com')).toBeNull()

    expect((await request('/admin/set-user-password', { body: { userId: plain.id, newPassword: fresh }, cookie })).status).toBe(200)
    expect((await request('/change-password', { body: { currentPassword: password, newPassword: fresh }, cookie })).status).toBe(200)
  })

  it('signs in without a lookup, and refuses to set a password while the list cannot be reached', async () => {
    lookup(corpus)
    const { request, signIn, plain } = await serve(true)
    lookup(() => new Response('unavailable', { status: 503 }))
    asked.length = 0
    const cookie = await signIn('root@example.com')
    expect(asked).toEqual([])

    const response = await request('/admin/set-user-password', { body: { userId: plain.id, newPassword: fresh }, cookie })
    expect(response.status).toBe(500)
    expect(asked).toEqual([sha1(fresh).slice(0, 5)])
  })

  it('looks nothing up when off', async () => {
    lookup(corpus)
    const { request, signIn, plain } = await serve(false)
    const cookie = await signIn('root@example.com')
    expect((await request('/admin/set-user-password', { body: { userId: plain.id, newPassword: leaked }, cookie })).status).toBe(200)
    expect(asked).toEqual([])
  })
})
