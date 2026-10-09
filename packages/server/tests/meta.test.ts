import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Kysely } from 'kysely'
import { PGliteDialect } from 'kysely-pglite-dialect'
import { f, resource, view } from '@protobase/schema'
import { companies } from '../../../test-support/server'
import { as, createFixtureDb, createTestApp, testAuthenticator, type TestApp } from '../../../test-support/server'
import { createAdmin } from '../src/create-admin'
import { createEmptyPg } from '../../../test-support/pglite-snapshot'

let fixture: Awaited<ReturnType<typeof createFixtureDb>>
let app: TestApp
beforeAll(async () => {
  fixture = await createFixtureDb()
  app = createTestApp(fixture)
})
afterAll(async () => { await fixture.db.destroy() })

describe('GET /meta', () => {
  it('returns every resource model with an ETag and X-Meta-Version', async () => {
    const response = await app.request('/api/meta', { headers: as(1) })
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body.resources.map((r: { name: string }) => r.name)).toEqual(['organizations', 'companies', 'labels', 'lineItems', 'events'])
    expect(body.resources[1]).toMatchObject({ primaryKey: ['id'], tenant: 'organizationId', softDelete: 'deletedAt' })
    expect(body.views).toEqual([])
    expect(response.headers.get('etag')).toMatch(/^"[0-9a-f]{32}"$/)
    expect(body.resources[2].fields.code.default).toEqual({ db: true })
    expect(body.resources[1].fields.status.default).toEqual({ value: 'open' })
  })

  it('answers 304 when If-None-Match matches, and still sends X-Meta-Version', async () => {
    const first = await app.request('/api/meta', { headers: as(1) })
    const second = await app.request('/api/meta', { headers: as(1, 'admin', { 'if-none-match': first.headers.get('etag')! }) })
    expect(second.status).toBe(304)
    expect(await second.text()).toBe('')
    expect(second.headers.get('x-meta-version')).toBe(first.headers.get('x-meta-version'))
    const other = await app.request('/api/meta', { headers: as(1, 'admin', { 'if-none-match': '"stale"' }) })
    expect(other.status).toBe(200)
  })

  it('includes the views that were passed in, value labels too, and changes version with them', async () => {
    const withView = createAdmin({
      resources: [companies],
      views: [view<typeof companies>('companies').names({ singular: 'Company', plural: 'Companies' }).fields((r) => ({ status: r.status.valueLabels({ won: 'Closed won' }) }))],
      db: fixture.db,
      authenticate: testAuthenticator,
    })
    const body = await (await withView.request('/api/meta', { headers: as(1) })).json()
    expect(body.views[0]).toMatchObject({ resource: 'companies', names: { plural: 'Companies' }, fields: { status: { valueLabels: { won: 'Closed won' } } } })
    const plain = await app.request('/api/meta', { headers: as(1) })
    expect((await withView.request('/api/meta', { headers: as(1) })).headers.get('x-meta-version')).not.toBe(plain.headers.get('x-meta-version'))
  })

  it('evaluates permissions per resource for the caller, and the ETag varies with them', async () => {
    const admin = await app.request('/api/meta', { headers: as(1, 'admin') })
    const viewer = await app.request('/api/meta', { headers: as(1, 'viewer') })
    const sales = await app.request('/api/meta', { headers: as(1, 'restricted') })
    expect((await admin.json()).permissions.companies).toEqual({ read: true, create: true, update: true, delete: true, conditional: [] })
    expect((await viewer.json()).permissions.companies).toMatchObject({ delete: false, create: true })
    expect((await sales.json()).permissions.labels.conditional).toEqual(['create', 'update'])
    expect(viewer.headers.get('etag')).not.toBe(admin.headers.get('etag'))
    expect(viewer.headers.get('x-meta-version')).not.toBe(admin.headers.get('x-meta-version'))
    expect((await app.request('/api/meta', { headers: as(2, 'admin') })).headers.get('x-meta-version')).toBe(admin.headers.get('x-meta-version'))
    const again = await app.request('/api/meta', { headers: as(1, 'viewer', { 'if-none-match': viewer.headers.get('etag')! }) })
    expect(again.status).toBe(304)
    const crossed = await app.request('/api/meta', { headers: as(1, 'admin', { 'if-none-match': viewer.headers.get('etag')! }) })
    expect(crossed.status).toBe(200)
  })

  it('keeps X-Meta-Version stable across requests and endpoints, and independent of the per-caller ETag', async () => {
    const first = await app.request('/api/meta', { headers: as(1, 'admin') })
    const again = await app.request('/api/meta', { headers: as(1, 'admin', { 'if-none-match': first.headers.get('etag')! }) })
    const listed = await app.request('/api/v1/companies', { headers: as(1, 'admin') })
    const version = first.headers.get('x-meta-version')
    expect(again.headers.get('x-meta-version')).toBe(version)
    expect(listed.headers.get('x-meta-version')).toBe(version)
    // Clients compare versions with versions: the ETag hashes the whole body for this caller, the version only models and roles.
    expect(first.headers.get('etag')!.replace(/"/g, '')).not.toBe(version)
  })

  it('sends X-Meta-Version on errors too', async () => {
    const response = await app.request('/api/v1/nothing', { headers: as(1) })
    expect(response.status).toBe(404)
    expect(response.headers.get('x-meta-version')).toMatch(/^[0-9a-f]{32}$/)
  })
})

describe('resource names and system endpoints', () => {
  it('keeps /api/v1 for resources only, so a table may be called meta or docs', async () => {
    const odd = resource('meta').table('meta_rows').fields({ id: f.integer().readOnly().filterable().sortable() }).primaryKey((r) => r.id)
    const docsTable = resource('docs').table('docs_rows').fields({ id: f.integer().readOnly().filterable().sortable() }).primaryKey((r) => r.id)
    const pg = await createEmptyPg()
    await pg.exec('create table meta_rows (id integer primary key); create table docs_rows (id integer primary key); insert into meta_rows values (1); insert into docs_rows values (7)')
    const odds = createAdmin({ resources: [odd, docsTable], db: new Kysely({ dialect: new PGliteDialect(pg) }), authenticate: testAuthenticator })
    expect((await (await odds.request('/api/v1/meta', { headers: as(1) })).json()).items).toEqual([expect.objectContaining({ id: 1 })])
    expect((await (await odds.request('/api/v1/docs/7', { headers: as(1) })).json()).id).toBe(7)
    const system = await (await odds.request('/api/meta', { headers: as(1) })).json()
    expect(system.resources.map((r: { name: string }) => r.name)).toEqual(['meta', 'docs'])
    expect((await odds.request('/api/openapi.json', { headers: as(1) })).status).toBe(200)
  })
})
