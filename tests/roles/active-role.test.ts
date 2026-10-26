import { decodeJwt } from 'jose'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bottomBar } from '@protobase/schema'
import { createAdmin, createUser, setUserRole } from '@protobase/server'
import { betterAuthAuthenticator, createAuth } from '@protobase/server/internal'
import { allResources, createFixtureDb } from '../../test-support/server'
import { openSnapshotDb, type SnapshotDb } from '../../test-support/sql-snapshot'

const origin = 'http://localhost:5173'
const password = 'correct horse battery'

// The fixture's companies: only an admin deletes them, and sales lists the open ones only. Each role has a bottom bar.
describe('switching the active role', () => {
  let fixture: Awaited<ReturnType<typeof createFixtureDb>>
  let app: ReturnType<typeof createAdmin>

  beforeAll(async () => {
    fixture = await createFixtureDb()
    const store = await openSnapshotDb('auth')
    const auth = createAuth({ database: { dialect: store.dialect, type: 'postgres' }, baseURL: origin, secret: 'test-secret-test-secret-test-secret-1234', roles: ['sales'], mailer: false, signInPerMinute: 100 })
    const bars = [bottomBar({ label: 'Desk', roles: ['admin'] }, (m) => [m.resource('labels', { label: 'Labels' })]), bottomBar({ label: 'Field', roles: ['sales'] }, (m) => [m.resource('companies', { label: 'Companies' })])]
    app = createAdmin({ resources: allResources, bottomBars: bars, db: fixture.db, authenticate: betterAuthAuthenticator({ auth, tenant: 1 }), auth })
    await createUser(auth, { email: 'root@example.com', password })
    await createUser(auth, { email: 'pat@example.com', password, role: 'sales' })
    await setUserRole(auth, { email: 'pat@example.com', role: 'admin,sales' })
  })
  afterAll(async () => { await fixture.db.destroy() })

  const call = (path: string, init: { cookie?: string; token?: string; body?: unknown; method?: string } = {}) =>
    app.request(`${origin}${path}`, {
      method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
      headers: { 'content-type': 'application/json', origin, ...(init.cookie && { cookie: init.cookie }), ...(init.token && { authorization: `Bearer ${init.token}` }) },
      ...(init.body !== undefined && { body: JSON.stringify(init.body) }),
    })
  const signIn = async () => (await call('/api/auth/sign-in/email', { body: { email: 'pat@example.com', password } })).headers.getSetCookie().map((line) => line.split(';')[0]).join('; ')
  const tokenOf = async (cookie: string) => ((await (await call('/api/auth/token', { cookie })).json()) as { token: string }).token
  const barOf = async (token: string) => ((await (await call('/api/meta', { token })).json()) as { bottomBar?: { label: string } }).bottomBar?.label
  const statuses = async (token: string) => new Set(((await (await call('/api/v1/companies?page_size=50', { token })).json()) as { items: { status: string }[] }).items.map((company) => company.status))

  it('makes the API and the bottom bar follow the switched role, and the next session starts in it', async () => {
    const cookie = await signIn()
    expect(await (await call('/api/auth/role/current', { cookie })).json()).toEqual({ active: 'admin', roles: [{ name: 'admin', label: 'Superuser' }, { name: 'sales', label: 'sales' }] })
    const admin = await tokenOf(cookie)
    expect(decodeJwt(admin).role).toBe('admin')
    expect(await statuses(admin)).toEqual(new Set(['open', 'won', 'lost']))
    expect(await barOf(admin)).toBe('Desk')

    expect((await call('/api/auth/role/switch', { cookie, body: { role: 'sales' } })).status).toBe(200)
    const sales = await tokenOf(cookie)
    expect(decodeJwt(sales).role).toBe('sales')
    expect(await statuses(sales)).toEqual(new Set(['open']))
    expect(await barOf(sales)).toBe('Field')
    expect((await call('/api/v1/companies/22', { token: sales, method: 'DELETE' })).status).toBe(403)
    expect((await call('/api/auth/policy/sign-in', { cookie })).status).toBe(403)

    const refused = await call('/api/auth/role/switch', { cookie, body: { role: 'accountant' } })
    expect(refused.status).toBe(403)
    expect(await refused.json()).toMatchObject({ code: 'ROLE_NOT_HELD' })

    const next = await signIn()
    expect(decodeJwt(await tokenOf(next)).role).toBe('sales')
    await call('/api/auth/role/switch', { cookie: next, body: { role: 'admin' } })
    expect((await call('/api/v1/companies/22', { token: await tokenOf(next), method: 'DELETE' })).status).toBe(204)
    expect((await call('/api/auth/policy/sign-in', { cookie: next })).status).toBe(200)
  })
})
