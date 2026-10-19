import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
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

let fixture: Awaited<ReturnType<typeof createFixtureDb>>
beforeAll(async () => { fixture = await createFixtureDb() })
afterAll(async () => { await fixture.db.destroy() })

let client = 0

/** An app without organizations on a fresh auth store, with Root as its only admin and Plain as a user. */
const serve = async () => {
  const store = await openSnapshotDb('auth')
  const auth = createAuth({ database: { dialect: store.dialect, type: 'postgres' }, baseURL: origin, secret, mailer: false, signInPerMinute: 100 })
  await settled()
  const root = await createUser(auth, { email: 'root@example.com', password })
  const plain = await createUser(auth, { email: 'plain@example.com', password, role: 'user' })
  const app = createAdmin({ resources: allResources, db: fixture.db, authenticate: betterAuthAuthenticator({ auth, tenant: 1 }), auth })
  const address = `198.51.100.${++client}`
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
  return { store, request, signIn, root, plain }
}

describe('the last admin over HTTP', () => {
  it('cannot be demoted, through set-role or update-user, nor blocked', async () => {
    const { request, signIn, root } = await serve()
    const cookie = await signIn('root@example.com')
    for (const [path, body] of [
      ['/admin/set-role', { userId: root.id, role: 'user' }],
      ['/admin/update-user', { userId: root.id, data: { role: 'user' } }],
      ['/admin/update-user', { userId: root.id, data: { banned: true } }],
      ['/admin/ban-user', { userId: root.id }],
      ['/admin/remove-user', { userId: root.id }],
    ] as const) {
      const response = await request(path, { body, cookie })
      expect(response.status).toBe(400)
      expect(await response.json()).toMatchObject({ code: 'LAST_ADMIN' })
    }
  })

  it('can be demoted once another admin exists, and other users change freely', async () => {
    const { store, request, signIn, root, plain } = await serve()
    const cookie = await signIn('root@example.com')
    expect((await request('/admin/update-user', { body: { userId: plain.id, data: { banned: true } }, cookie })).status).toBe(200)
    expect((await request('/admin/unban-user', { body: { userId: plain.id }, cookie })).status).toBe(200)
    expect((await request('/admin/set-role', { body: { userId: plain.id, role: 'admin' }, cookie })).status).toBe(200)
    expect((await request('/admin/set-role', { body: { userId: root.id, role: 'user' }, cookie })).status).toBe(200)
    const { rows } = await store.query<{ email: string; role: string }>('select email, role from "user" order by email')
    expect(rows).toEqual([{ email: 'plain@example.com', role: 'admin' }, { email: 'root@example.com', role: 'user' }])
  })
})
