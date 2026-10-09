import { PGlite } from '@electric-sql/pglite'
import { getMigrations } from 'better-auth/db/migration'
import { PGliteDialect } from 'kysely-pglite-dialect'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { betterAuthAuthenticator } from '../src/better-auth/authenticator'
import { createAuth } from '../src/better-auth/create-auth'
import { issueToken } from '../src/better-auth/tokens'
import { normalizeRoles } from '../src/better-auth/create-auth'
import { createUser, deleteUser, parseRoles, roleChoices, hasUsers, listUsers, setUserBanned, setUserRole } from '../src/better-auth/users'
import { createAdmin } from '../src/create-admin'
import { createEmptyPg } from '../../../test-support/pglite-snapshot'
import { createAuthStore } from '../../../test-support/auth'
import { allResources, createFixtureDb, signTestToken } from '../../../test-support/server'

const origin = 'http://localhost:5173'
const password = 'correct horse battery'
const secret = 'test-secret-test-secret-test-secret-1234'

let fixture: Awaited<ReturnType<typeof createFixtureDb>>
let store: PGlite
let auth: ReturnType<typeof createAuth>
let app: ReturnType<typeof createAdmin>

beforeAll(async () => {
  fixture = await createFixtureDb()
  store = await createAuthStore()
  auth = createAuth({ database: { dialect: new PGliteDialect(store), type: 'postgres' }, baseURL: origin, secret, signInPerMinute: 100 })
  app = createAdmin({ resources: allResources, db: fixture.db, authenticate: betterAuthAuthenticator({ auth, tenant: 1 }), auth })
})
afterAll(async () => { await fixture.db.destroy() })
afterEach(() => { vi.useRealTimers() })

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  app.request(`${origin}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', origin, ...headers }, body: JSON.stringify(body) })

const tokenFor = async (email: string) => {
  const signIn = await post('/api/auth/sign-in/email', { email, password })
  expect(signIn.status).toBe(200)
  const cookie = signIn.headers.getSetCookie().map((line) => line.split(';')[0]).join('; ')
  const response = await app.request(`${origin}/api/auth/token`, { headers: { cookie, origin } })
  return ((await response.json()) as { token: string }).token
}

const api = (path: string, token?: string, init: RequestInit = {}) =>
  app.request(`${origin}/api/v1${path}`, { ...init, headers: { ...(token && { authorization: `Bearer ${token}` }), ...(init.headers as Record<string, string>) } })

describe('the first admin', () => {
  it('cannot be created over HTTP: no route exists while the store is empty, sign-in and sign-up fail', async () => {
    expect((await api('/companies')).status).toBe(401)
    expect((await post('/api/auth/setup', { email: 'root@example.com', password, name: 'Root' })).status).toBe(404)
    expect((await post('/api/auth/sign-up/email', { email: 'intruder@example.com', password, name: 'Intruder' })).status).toBeGreaterThanOrEqual(400)
    expect((await post('/api/auth/admin/create-user', { email: 'intruder@example.com', password, name: 'Intruder' })).status).toBeGreaterThanOrEqual(400)
    expect((await post('/api/auth/sign-in/email', { email: 'root@example.com', password })).status).toBeGreaterThanOrEqual(400)
    expect((await store.query('select 1 from "user"')).rows).toHaveLength(0)
  })

  it('is reported by the status endpoint until a user exists', async () => {
    expect(await (await app.request(`${origin}/api/auth/status`)).json()).toEqual({ needsAdmin: true, passwordReset: false })
    expect(await hasUsers(auth)).toBe(false)
    const root = await createUser(auth, { email: 'root@example.com', password, name: 'Root', role: 'user' })
    expect(root.role).toBe('admin')
    expect(await hasUsers(auth)).toBe(true)
    expect(await (await app.request(`${origin}/api/auth/status`)).json()).toEqual({ needsAdmin: false, passwordReset: false })
  })

  it('lists users without secrets, and later users get the requested role', async () => {
    const second = await createUser(auth, { email: 'later@example.com', password })
    expect(second.role).toBe('user')
    const users = await listUsers(auth)
    expect(users.map((user) => [user.email, user.role])).toEqual([['root@example.com', 'admin'], ['later@example.com', 'user']])
    expect(JSON.stringify(users)).not.toContain(password)
    await store.exec(`delete from account where "userId" = '${second.id}'; delete from session where "userId" = '${second.id}'; delete from "user" where id = '${second.id}'`)
  })

  it('does not offer public sign-up once users exist either', async () => {
    const response = await post('/api/auth/sign-up/email', { email: 'intruder@example.com', password, name: 'Intruder' })
    expect(response.status).toBeGreaterThanOrEqual(400)
    expect((await store.query("select 1 from \"user\" where email = 'intruder@example.com'")).rows).toHaveLength(0)
  })
})

describe('tokens', () => {
  it('lets a token from the JWKS use the API inside the configured tenant', async () => {
    const token = await tokenFor('root@example.com')
    const response = await api('/companies?count=exact&page_size=1', token)
    expect(response.status).toBe(200)
    expect((await response.json()).total_size).toBeGreaterThan(2900)
  })

  it('passes the roles to access rules: an admin may delete, a plain user may not', async () => {
    await createUser(auth, { email: 'plain@example.com', password, name: 'Plain', role: 'user' })
    const adminToken = await tokenFor('root@example.com')
    const userToken = await tokenFor('plain@example.com')
    const forbidden = await api('/companies/21', userToken, { method: 'DELETE' })
    expect(forbidden.status).toBe(403)
    expect((await api('/companies/21', userToken)).status).toBe(200)
    expect((await api('/companies/21', adminToken, { method: 'DELETE' })).status).toBe(204)
  })

  it('answers 401 without a token, with garbage, with a tampered token and with an expired one', async () => {
    const token = await tokenFor('root@example.com')
    expect((await api('/companies')).status).toBe(401)
    expect((await api('/companies', 'garbage')).status).toBe(401)
    const [header, payload, signature] = token.split('.')
    expect((await api('/companies', `${header}.${payload}.${signature!.slice(0, -4)}AAAA`)).status).toBe(401)
    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() + 16 * 60_000 })
    const expired = await api('/companies', token)
    expect(expired.status).toBe(401)
    expect(expired.headers.get('content-type')).toContain('application/problem+json')
  })

  it('issues tokens that last 15 minutes', async () => {
    const token = await tokenFor('root@example.com')
    const claims = JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString()) as { exp: number; iat: number; role: string }
    expect(claims.exp - claims.iat).toBe(15 * 60)
    expect(claims.role).toBe('admin')
  })

  it('never takes the tenant from the token', async () => {
    const token = await tokenFor('root@example.com')
    const response = await api('/companies?count=exact&page_size=1', token)
    const stored = await fixture.pg.query<{ n: string }>('select count(*)::text n from companies where organization_id = 1 and deleted_at is null')
    expect((await response.json()).total_size).toBe(Number(stored.rows[0]!.n))
  })
})

describe('issueToken', () => {
  const claimsOf = (token: string) => JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString()) as { exp: number; iat: number; sub: string; role: string; email: string; iss: string; aud: string }

  it('mints a token the API accepts, with the claims of a browser token and 15 minutes by default', async () => {
    const { token, expiresAt } = await issueToken(auth, { email: 'ROOT@example.com' })
    const claims = claimsOf(token)
    expect(claims.exp - claims.iat).toBe(15 * 60)
    expect(claims).toMatchObject({ role: 'admin', email: 'root@example.com', iss: origin, aud: origin })
    expect(new Date(expiresAt).getTime() / 1000).toBe(claims.exp)
    const browser = claimsOf(await tokenFor('root@example.com'))
    expect(claims.sub).toBe(browser.sub)
    expect((await api('/companies?page_size=1', token)).status).toBe(200)
  })

  it('honors a lifetime up to 24 hours and refuses more', async () => {
    const claims = claimsOf((await issueToken(auth, { email: 'root@example.com', ttlSeconds: 24 * 3600 })).token)
    expect(claims.exp - claims.iat).toBe(24 * 3600)
    await expect(issueToken(auth, { email: 'root@example.com', ttlSeconds: 24 * 3600 + 1 })).rejects.toThrow('24 hours')
    await expect(issueToken(auth, { email: 'root@example.com', ttlSeconds: 0 })).rejects.toThrow('between')
  })

  it('refuses an unknown user, and the token expires', async () => {
    await expect(issueToken(auth, { email: 'nobody@example.com' })).rejects.toThrow('No user')
    const { token } = await issueToken(auth, { email: 'root@example.com', ttlSeconds: 60 })
    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() + 2 * 60_000 })
    expect((await api('/companies', token)).status).toBe(401)
  })
})

describe('the production path: Better Auth keys, published as JWKS', () => {
  const tamper = (token: string) => {
    const [header, payload, signature] = token.split('.')
    const claims = JSON.parse(Buffer.from(payload!, 'base64url').toString())
    return `${header}.${Buffer.from(JSON.stringify({ ...claims, role: 'admin', sub: 'someone-else' })).toString('base64url')}.${signature}`
  }

  it('signs with an asymmetric key and verifies tokens from /api/auth/token and issueToken through the JWKS', async () => {
    const fromSession = await tokenFor('root@example.com')
    const issued = (await issueToken(auth, { email: 'root@example.com' })).token
    for (const token of [fromSession, issued]) {
      const header = JSON.parse(Buffer.from(token.split('.')[0]!, 'base64url').toString()) as { alg: string; kid: string }
      expect(['EdDSA', 'ES256', 'RS256', 'PS256', 'ES512']).toContain(header.alg)
      expect(header.kid).toBeTruthy()
      expect((await api('/companies?page_size=1', token)).status).toBe(200)
    }
    const jwks = (await (await app.request(`${origin}/api/auth/jwks`)).json()) as { keys: Array<Record<string, unknown>> }
    expect(jwks.keys.length).toBeGreaterThan(0)
    expect(jwks.keys.every((key) => !('d' in key))).toBe(true)
  })

  it('answers 401 for a tampered token, a token from another Better Auth key pair, and an HS256 token', async () => {
    const good = (await issueToken(auth, { email: 'root@example.com' })).token
    expect((await api('/companies', tamper(good))).status).toBe(401)

    const foreign = createAuth({ database: { dialect: new PGliteDialect(await createAuthStore()), type: 'postgres' }, baseURL: origin, secret: 'another-secret-another-secret-12345678' })
    await createUser(foreign, { email: 'root@example.com', password })
    const forged = (await issueToken(foreign, { email: 'root@example.com' })).token
    expect((await api('/companies', forged)).status).toBe(401)

    expect((await api('/companies', signTestToken({ roles: ['admin'] }))).status).toBe(401)
  })
})

describe('JWKS caching in betterAuthAuthenticator', () => {
  it('reads Better Auth\'s key table once for many requests', async () => {
    const reads = vi.spyOn(auth.api, 'getJwks')
    const cached = createAdmin({ resources: allResources, db: fixture.db, authenticate: betterAuthAuthenticator({ auth, tenant: 1 }) })
    const token = (await issueToken(auth, { email: 'root@example.com' })).token
    reads.mockClear()
    for (let i = 0; i < 20; i++) expect((await cached.request(`${origin}/api/v1/companies?page_size=1`, { headers: { authorization: `Bearer ${token}` } })).status).toBe(200)
    expect(reads).toHaveBeenCalledTimes(1)
    reads.mockRestore()
  })
})

const claimsOfToken = (token: string) => JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString()) as { role: string }

describe('managing users on the host', () => {
  const emails = async () => (await listUsers(auth)).map((user) => `${user.email}:${user.role}${user.banned ? ':banned' : ''}`)

  it('bans (ending sessions and sign-in), unbans, changes roles and deletes', async () => {
    await createUser(auth, { email: 'temp@example.com', password })
    const token = await tokenFor('temp@example.com')
    expect((await api('/companies?page_size=1', token)).status).toBe(200)

    await setUserBanned(auth, { email: 'temp@example.com', banned: true })
    expect((await emails())).toContain('temp@example.com:user:banned')
    expect((await post('/api/auth/sign-in/email', { email: 'temp@example.com', password })).status).toBeGreaterThanOrEqual(400)
    expect((await store.query(`select 1 from session s join "user" u on u.id = s."userId" where u.email = 'temp@example.com'`)).rows).toHaveLength(0)
    await setUserBanned(auth, { email: 'temp@example.com', banned: false })
    expect((await post('/api/auth/sign-in/email', { email: 'temp@example.com', password })).status).toBe(200)

    expect(await setUserRole(auth, { email: 'TEMP@example.com', role: 'admin' })).toEqual({ email: 'temp@example.com', role: 'admin' })
    await expect(setUserRole(auth, { email: 'temp@example.com', role: 'superuser' })).rejects.toThrow('Unknown role')
    expect((await store.query(`select role from "user" where email = 'temp@example.com'`)).rows[0]).toEqual({ role: 'admin' })
    const promoted = claimsOfToken((await issueToken(auth, { email: 'temp@example.com' })).token)
    expect(promoted.role).toBe('admin')
    await setUserRole(auth, { email: 'temp@example.com', role: 'user' })

    await deleteUser(auth, 'temp@example.com')
    expect(await emails()).not.toContain('temp@example.com:user')
    expect((await store.query(`select 1 from account a left join "user" u on u.id = a."userId" where u.id is null`)).rows).toHaveLength(0)
    await expect(deleteUser(auth, 'temp@example.com')).rejects.toThrow('No user')
  })

  it('never removes, demotes or bans the last active admin', async () => {
    await expect(deleteUser(auth, 'root@example.com')).rejects.toThrow('Cannot delete the last admin')
    await expect(setUserRole(auth, { email: 'root@example.com', role: 'user' })).rejects.toThrow('Cannot demote the last admin')
    await expect(setUserBanned(auth, { email: 'root@example.com', banned: true })).rejects.toThrow('Cannot ban the last admin')

    await createUser(auth, { email: 'second@example.com', password, role: 'admin' })
    await setUserBanned(auth, { email: 'second@example.com', banned: true })
    await expect(deleteUser(auth, 'root@example.com')).rejects.toThrow('last admin')
    await setUserBanned(auth, { email: 'second@example.com', banned: false })
    await setUserRole(auth, { email: 'root@example.com', role: 'user' })
    await expect(setUserRole(auth, { email: 'second@example.com', role: 'user' })).rejects.toThrow('last admin')
    await setUserRole(auth, { email: 'root@example.com', role: 'admin' })
    await deleteUser(auth, 'second@example.com')
    expect(await emails()).toEqual(expect.arrayContaining(['root@example.com:admin']))
  })
})

describe('the Better Auth storage that users.ts depends on', () => {
  it('still has the user columns and adapter calls used, so a Better Auth upgrade that moves them fails here', async () => {
    const columns = (await store.query<{ column_name: string }>("select column_name from information_schema.columns where table_name = 'user'")).rows.map((row) => row.column_name)
    expect(columns).toEqual(expect.arrayContaining(['id', 'email', 'role', 'banned', 'banReason', 'banExpires', 'createdAt']))
    const { adapter, internalAdapter } = await auth.$context
    for (const call of [adapter.count, adapter.findMany, adapter.findOne, internalAdapter.updateUser, internalAdapter.deleteUser, internalAdapter.deleteUserSessions]) {
      expect(typeof call).toBe('function')
    }
  })
})

describe('configurable roles', () => {
  it('reads roles written as a Postgres array literal as well as plain strings', () => {
    expect(parseRoles('{admin}')).toEqual(['admin'])
    expect(parseRoles('{"admin",sales}')).toEqual(['admin', 'sales'])
    expect(parseRoles('admin,sales')).toEqual(['admin', 'sales'])
    expect(parseRoles(null)).toEqual(['user'])
  })

  it('normalizes the list: admin first and always present, names checked', () => {
    expect(normalizeRoles()).toEqual(['admin', 'user'])
    expect(normalizeRoles(['accountant', 'admin', 'accountant'])).toEqual(['admin', 'accountant'])
    expect(() => normalizeRoles(['Sales Rep'])).toThrow('Invalid role')
  })

  it('has an explicit default role, only when configured or unambiguous', async () => {
    // Only reads the configuration; the store is never queried.
    const make = (extra: object) => createAuth({ database: { dialect: new PGliteDialect(store), type: 'postgres' }, baseURL: origin, secret, ...extra })
    expect(make({ roles: ['sales', 'editor'] }).defaultRole).toBeUndefined()
    expect(make({ roles: ['sales', 'editor'], defaultRole: 'editor' }).defaultRole).toBe('editor')
    expect(make({}).defaultRole).toBe('user')
    expect(make({ roles: ['auditor'] }).defaultRole).toBe('auditor')
    expect(() => make({ roles: ['sales'], defaultRole: 'manager' })).toThrow('not one of the roles')
  })

  it('keeps the admin store in its own schema of a shared database', async () => {
    const shared = await createEmptyPg()
    const scoped = createAuth({ database: { dialect: new PGliteDialect(shared), type: 'postgres', schemaName: 'auth' }, baseURL: origin, secret })
    await (await getMigrations(scoped.options)).runMigrations()
    await createUser(scoped, { email: 'boss@example.com', password })
    expect(await hasUsers(scoped)).toBe(true)

    const { rows } = await shared.query<{ table_schema: string }>(`select distinct table_schema from information_schema.tables where table_name in ('user', 'session', 'jwks')`)
    expect(rows.map((row) => row.table_schema)).toEqual(['auth'])
    expect((await getMigrations(scoped.options)).toBeCreated).toEqual([])
  })

  it('validates users and role changes against the project roles, and passes them to access rules', async () => {
    const roleStore = await createAuthStore()
    const roled = createAuth({ database: { dialect: new PGliteDialect(roleStore), type: 'postgres' }, baseURL: origin, secret, roles: ['accountant', 'warehouse'], signInPerMinute: 100 })
    const roleApp = createAdmin({ resources: allResources, db: fixture.db, authenticate: betterAuthAuthenticator({ auth: roled, tenant: 1 }), auth: roled })
    expect(roleChoices(roled)).toEqual(['admin', 'accountant', 'warehouse'])

    await createUser(roled, { email: 'boss@example.com', password })
    await expect(createUser(roled, { email: 'clerk@example.com', password })).rejects.toThrow('A role is required: choose one of admin, accountant, warehouse')
    const clerk = await createUser(roled, { email: 'clerk@example.com', password, role: 'accountant' })
    expect(clerk.role).toBe('accountant')
    await expect(createUser(roled, { email: 'x@example.com', password, role: 'user' })).rejects.toThrow('Unknown role "user"; use admin, accountant, warehouse')
    expect(await setUserRole(roled, { email: 'clerk@example.com', role: 'accountant,warehouse' })).toEqual({ email: 'clerk@example.com', role: 'accountant,warehouse' })
    await expect(setUserRole(roled, { email: 'clerk@example.com', role: 'manager' })).rejects.toThrow('Unknown role "manager"')

    const { token } = await issueToken(roled, { email: 'clerk@example.com' })
    expect(JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString()).role).toBe('accountant,warehouse')
    const headers = { authorization: `Bearer ${token}` }
    expect((await roleApp.request(`${origin}/api/v1/companies?page_size=1`, { headers })).status).toBe(200)
    expect((await roleApp.request(`${origin}/api/v1/companies/22`, { method: 'DELETE', headers })).status).toBe(403)
    const boss = (await issueToken(roled, { email: 'boss@example.com' })).token
    expect((await roleApp.request(`${origin}/api/v1/companies/22`, { method: 'DELETE', headers: { authorization: `Bearer ${boss}` } })).status).toBe(204)

    const signIn = await roleApp.request(`${origin}/api/auth/sign-in/email`, { method: 'POST', headers: { 'content-type': 'application/json', origin }, body: JSON.stringify({ email: 'boss@example.com', password }) })
    expect(signIn.status).toBe(200)
    const bossCookie = signIn.headers.getSetCookie().map((line) => line.split(';')[0]).join('; ')
    const invalid = await roleApp.request(`${origin}/api/auth/admin/create-user`, { method: 'POST', headers: { 'content-type': 'application/json', origin, cookie: bossCookie }, body: JSON.stringify({ email: 'y@example.com', password, name: 'Y', role: 'user' }) })
    expect(invalid.status).toBeGreaterThanOrEqual(400)
    const noRole = await roleApp.request(`${origin}/api/auth/admin/create-user`, { method: 'POST', headers: { 'content-type': 'application/json', origin, cookie: bossCookie }, body: JSON.stringify({ email: 'w@example.com', password, name: 'W' }) })
    expect(noRole.status).toBeGreaterThanOrEqual(400)
    expect((await roleStore.query("select 1 from \"user\" where email = 'w@example.com'")).rows).toHaveLength(0)
    const valid = await roleApp.request(`${origin}/api/auth/admin/create-user`, { method: 'POST', headers: { 'content-type': 'application/json', origin, cookie: bossCookie }, body: JSON.stringify({ email: 'z@example.com', password, name: 'Z', role: 'warehouse' }) })
    expect(valid.status).toBe(200)
  })
})

describe('sign-in rate limit', () => {
  it('limits repeated sign-in attempts per client', async () => {
    const strict = createAuth({ database: { dialect: new PGliteDialect(store), type: 'postgres' }, baseURL: origin, secret, signInPerMinute: 3 })
    const limited = createAdmin({ resources: [], db: fixture.db, authenticate: betterAuthAuthenticator({ auth: strict }), auth: strict })
    const statuses: number[] = []
    for (let i = 0; i < 6; i++) {
      const response = await limited.request(`${origin}/api/auth/sign-in/email`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin, 'x-forwarded-for': '203.0.113.9' },
        body: JSON.stringify({ email: 'root@example.com', password: 'wrong password!' }),
      })
      statuses.push(response.status)
    }
    expect(statuses.slice(0, 3)).not.toContain(429)
    expect(statuses).toContain(429)
  })
})
