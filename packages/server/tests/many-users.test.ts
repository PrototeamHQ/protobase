import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { betterAuthAuthenticator } from '../src/better-auth/authenticator'
import { createAuth, type CreateAuthOptions } from '../src/better-auth/create-auth'
import { addEveryUser } from '../src/better-auth/organizations/add-every-user'
import { createOrganization } from '../src/better-auth/organizations/host'
import { createUser, deleteUser, listUsers, setUserBanned, setUserRole } from '../src/better-auth/users'
import { createAdmin } from '../src/create-admin'
import { allResources, createFixtureDb } from '../../../test-support/server'
import { openSnapshotDb, settled, type SnapshotDb } from '../../../test-support/sql-snapshot'

// Real scrypt hashing runs on this thread, CPU work a busy machine stretches past 5 s.
vi.setConfig({ testTimeout: 30_000 })

const origin = 'http://localhost:5173'
const secret = 'test-secret-test-secret-test-secret-1234'
const password = 'correct horse battery'

// Past Better Auth's 100 rows a read returns when not told how many: 150 users made in one statement, in pairs that
// share a creation time down to the millisecond and differ in the microsecond, or not at all.
const manyUsers = `insert into "user" (id, name, email, email_verified, role, banned, created_at, updated_at)
  select 'u' || lpad(i::text, 3, '0'), 'User ' || i, 'user' || i || '@example.com', true, 'user', false,
    timestamptz '2026-08-02 00:00:00+00' + (i / 2) * interval '1 microsecond', timestamptz '2026-08-02 00:00:00+00'
  from generate_series(1, 150) i`

let fixture: Awaited<ReturnType<typeof createFixtureDb>>
beforeAll(async () => { fixture = await createFixtureDb() })
afterAll(async () => { await fixture.db.destroy() })

let client = 0

const authOn = async (store: SnapshotDb, options: Partial<CreateAuthOptions> = {}) => {
  const auth = createAuth({ database: { dialect: store.dialect, type: 'postgres' }, baseURL: origin, secret, mailer: false, signInPerMinute: 100, ...options })
  // Its schema check, which starts once its context is made, finishes before the test's queries.
  await auth.$context
  await settled()
  return auth
}

/**
 * An app with 152 users whose only active admin is the newest, Last: Root, the first user, is an admin no more. A
 * read of every user, oldest first, stops long before Last.
 */
const serve = async () => {
  const store = await openSnapshotDb('auth')
  const auth = await authOn(store)
  await createUser(auth, { email: 'root@example.com', password })
  await store.query(manyUsers)
  const last = await createUser(auth, { email: 'last@example.com', password, role: 'admin' })
  await store.query(`update "user" set role = 'user' where email = 'root@example.com'`)
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
  return { store, auth, request, signIn, last }
}

describe('the last admin, past the first 100 users', () => {
  it('cannot be demoted, blocked or removed over HTTP, nor delete their own account', async () => {
    const { request, signIn, last } = await serve()
    const cookie = await signIn('last@example.com')
    for (const [path, body] of [
      ['/admin/set-role', { userId: last.id, role: 'user' }],
      ['/admin/update-user', { userId: last.id, data: { banned: true } }],
      ['/admin/remove-user', { userId: last.id }],
      ['/delete-user', { password }],
    ] as const) {
      const response = await request(path, { body, cookie })
      expect(response.status).toBe(400)
      expect(await response.json()).toMatchObject({ code: 'LAST_ADMIN' })
    }
  })

  it('cannot be demoted, banned or deleted on the host', async () => {
    const { auth } = await serve()
    await expect(setUserRole(auth, { email: 'last@example.com', role: 'user' })).rejects.toThrow('Cannot demote the last admin')
    await expect(setUserBanned(auth, { email: 'last@example.com', banned: true })).rejects.toThrow('Cannot ban the last admin')
    await expect(deleteUser(auth, 'last@example.com')).rejects.toThrow('Cannot delete the last admin')
  })

  it('counts only a whole admin role of someone not blocked as another admin', async () => {
    const { store, auth } = await serve()
    await store.query(`update "user" set role = 'superadmin' where id = 'u010'`)
    await store.query(`update "user" set role = 'admin', banned = true where id = 'u020'`)
    await expect(setUserRole(auth, { email: 'last@example.com', role: 'user' })).rejects.toThrow('Cannot demote the last admin')
    // A comma list with spaces, and the braced form a driver writes an array as, both name the admin role.
    for (const role of ['sales , admin', '{admin,sales}']) {
      await store.query(`update "user" set role = $1 where id = 'u030'`, [role])
      await setUserRole(auth, { email: 'last@example.com', role: 'user' })
      await setUserRole(auth, { email: 'last@example.com', role: 'admin' })
    }
  })

  it('can go once another admin exists, however late that admin joined', async () => {
    const { store, request, signIn, last } = await serve()
    await store.query(`update "user" set role = 'admin' where id = 'u150'`)
    const cookie = await signIn('last@example.com')
    expect((await request('/admin/set-role', { body: { userId: last.id, role: 'user' }, cookie })).status).toBe(200)
  })

  it('can delete their own account once another admin exists', async () => {
    const { store, request, signIn } = await serve()
    await store.query(`update "user" set role = 'admin' where id = 'u150'`)
    expect((await request('/delete-user', { body: { password }, cookie: await signIn('last@example.com') })).status).toBe(200)
    expect((await store.query(`select 1 from "user" where email = 'last@example.com'`)).rows).toEqual([])
  })
})

describe('the host user functions, past the first 100 users', () => {
  it('find each user by address, and change the 150th', async () => {
    const { store, auth } = await serve()
    expect(await setUserRole(auth, { email: 'user150@example.com', role: 'admin' })).toEqual({ email: 'user150@example.com', role: 'admin' })
    await setUserBanned(auth, { email: 'USER149@example.com', banned: true })
    await deleteUser(auth, 'user148@example.com')
    const { rows } = await store.query<{ id: string; role: string; banned: boolean }>(`select id, role, banned from "user" where id in ('u148', 'u149', 'u150') order by id`)
    expect(rows).toEqual([{ id: 'u149', role: 'user', banned: true }, { id: 'u150', role: 'admin', banned: false }])
    await expect(setUserRole(auth, { email: 'nobody@example.com', role: 'user' })).rejects.toThrow('No user with email nobody@example.com')
  })

  it('list every user, oldest first, page by page, without losing a microsecond or a tie', async () => {
    const { store, auth } = await serve()
    const listed: string[] = []
    let page = await listUsers(auth, { size: 7 })
    for (;;) {
      expect(page.users.length).toBeLessThanOrEqual(7)
      listed.push(...page.users.map((user) => user.email))
      if (!page.next) break
      page = await listUsers(auth, { after: page.next, size: 7 })
    }
    const { rows } = await store.query<{ email: string }>(`select email from "user" order by created_at, id`)
    expect(listed).toEqual(rows.map(({ email }) => email))
    expect(listed).toHaveLength(152)
    expect(listed.slice(2, 5)).toEqual(['user1@example.com', 'user2@example.com', 'user3@example.com'])
    expect((await listUsers(auth)).users).toHaveLength(152)
  })
})

describe('bringing every user into a new organization, past the first 100 users', () => {
  it('makes all of them members in one statement: admins owners, the others members with their global roles moved', async () => {
    const store = await openSnapshotDb('auth')
    const auth = await authOn(store, { roles: { sales: 'Sales', manager: 'Manager' }, organizations: { generateId: () => 'acme', create: 'everyone' } })
    await createUser(auth, { email: 'root@example.com', password })
    await store.query(manyUsers)
    await store.query(`update "user" set role = 'admin' where id = 'u150'`)
    await store.query(`update "user" set role = 'manager,sales' where id = 'u149'`)
    await createOrganization(auth, { name: 'Acme', slug: 'acme', owner: 'root@example.com' })
    const joined = await addEveryUser(auth, 'acme')
    expect(joined).toHaveLength(150)
    expect(joined.slice(-2)).toEqual([
      { email: 'user149@example.com', role: 'member', appRoles: ['manager', 'sales'] },
      { email: 'user150@example.com', role: 'owner', appRoles: ['sales', 'manager'] },
    ])
    const { rows } = await store.query<{ members: number; owners: number; global: string[] }>(
      `select count(*)::int as members, count(*) filter (where m.role = 'owner')::int as owners, array_agg(distinct u.role) as global
        from member m join "user" u on u.id = m.user_id where m.organization_id = 'acme'`,
    )
    expect(rows).toEqual([{ members: 151, owners: 2, global: ['admin', 'user'] }])
    // Everyone is a member now, so a second run adds nobody.
    expect(await addEveryUser(auth, 'acme')).toEqual([])
  })
})
