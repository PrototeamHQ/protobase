import { PGlite } from '@electric-sql/pglite'
import { Kysely } from 'kysely'
import { PGliteDialect } from 'kysely-pglite-dialect'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { f, resource, view } from '@protobase/schema'
import { createAdmin } from '../src/create-admin'
import { as, json, testAuthenticator } from '../../../test-support/server'
import { createEmptyPg } from '../../../test-support/pglite-snapshot'

const isAdmin = (ctx: { user?: { roles?: readonly string[] } }) => ctx.user?.roles?.includes('admin') ?? false

const ledger = resource('ledger')
  .table('ledger')
  .fields({
    id: f.integer().readOnly().filterable().sortable(),
    organizationId: f.relation('organizations').filterable(),
    title: f.text().filterable().sortable(),
    secret: f.text().filterable().sortable().access({ read: isAdmin }),
    status: f.enum(['open', 'locked']).default('open').filterable(),
  })
  .primaryKey((r) => r.id)
  .tenant((r) => r.organizationId)
  .search((r) => [r.title, r.secret])
  // A rule that needs the record: locked rows cannot be changed or deleted
  .access({
    update: (_ctx, record) => (record as { status: string }).status !== 'locked',
    delete: (_ctx, record) => (record as { status: string }).status !== 'locked',
  })

const ledgerView = view<typeof ledger>('ledger').list((r) => ({ columns: [r.title, r.secret], sort: [[r.secret, 'asc']], search: [r.secret, r.title] })).filters((r, w) => [w.facets(r.secret), w.facets(r.status)])
  .searchResult((r) => ({ title: [r.title, r.secret], subtitle: r.secret }))

let pg: PGlite
let db: Kysely<any>
let app: ReturnType<typeof createAdmin>
beforeAll(async () => {
  pg = await createEmptyPg()
  await pg.exec(`
    create table ledger (id integer generated always as identity primary key, organization_id integer not null, title text not null, secret text not null, status text not null default 'open');
    insert into ledger (organization_id, title, secret, status) values (1, 'visible one', 'alpha-secret', 'open'), (1, 'visible two', 'beta-secret', 'locked');
  `)
  db = new Kysely({ dialect: new PGliteDialect(pg) })
  app = createAdmin({ resources: [ledger], views: [ledgerView], db, authenticate: testAuthenticator })
})
afterAll(async () => { await db.destroy() })

const call = (roles: string, path: string, init: RequestInit = {}) =>
  app.request(path.startsWith('/api/') ? path : `/api/v1${path}`, { ...init, headers: { ...as(1, roles), ...(init.headers as Record<string, string>) } })

describe('a field the caller cannot read', () => {
  it('is not searched, listed, offered in views, documents or meta', async () => {
    const found = async (roles: string, text: string) => (await (await call(roles, `/ledger?filter=${encodeURIComponent(`search("${text}")`)}`)).json()).items.length
    expect(await found('admin', 'alpha-secret')).toBe(1)
    expect(await found('viewer', 'alpha-secret')).toBe(0)
    expect(await found('viewer', 'visible')).toBe(2)
    expect(await found('admin', 'secr')).toBe(2)
    expect(await found('viewer', 'secr')).toBe(0)
    expect(await found('viewer', 'VIS two')).toBe(1)
    for (const path of ['/ledger', '/ledger/1', '/api/meta', '/api/openapi.json']) {
      const text = await (await call('viewer', path)).text()
      expect(text, path).not.toContain('secret')
    }
    expect(await (await call('admin', '/api/meta')).text()).toContain('secret')
  })

  it('is pruned from the view the caller gets', async () => {
    const viewer = (await (await call('viewer', '/api/meta')).json()).views[0]
    expect(viewer.list).toEqual({ columns: ['title'], sort: [], search: ['title'] })
    expect(viewer.filters.map((widget: { field: string }) => widget.field)).toEqual(['status'])
    expect(viewer.searchResult).toEqual({ title: ['title'] })
    const admin = (await (await call('admin', '/api/meta')).json()).views[0]
    expect(admin.list.columns).toEqual(['title', 'secret'])
    expect(admin.searchResult).toEqual({ title: ['title', 'secret'], subtitle: 'secret' })
  })

  it('cannot be written blind either, and is not in the response of a write', async () => {
    const created = await call('viewer', '/ledger', json({ title: 'new', secret: 'sneaky' }, as(1, 'viewer')))
    expect(created.status).toBe(400)
    expect((await created.json()).errors[0]).toMatchObject({ field: 'secret', code: 'unknown-field' })
    const ok = await call('admin', '/ledger', json({ title: 'by admin', secret: 'gamma-secret' }, as(1, 'admin')))
    expect((await ok.json()).secret).toBe('gamma-secret')
  })
})

describe('record permissions', () => {
  it('say per record, and per field, what the caller may do', async () => {
    const open = await (await call('admin', '/ledger/1')).json()
    expect(open.permissions).toMatchObject({ update: true, delete: true })
    expect(open.permissions.fields).toMatchObject({ title: 'edit', secret: 'edit', status: 'edit' })
    const locked = await (await call('admin', '/ledger/2')).json()
    expect(locked.permissions).toMatchObject({ update: false, delete: false })
    expect(Object.values(locked.permissions.fields).every((mode) => mode === 'read')).toBe(true)
    const viewerOpen = await (await call('viewer', '/ledger/1')).json()
    expect(Object.keys(viewerOpen.permissions.fields).sort()).toEqual(['id', 'organizationId', 'status', 'title'])
  })

  it('are on each list item, and the same rule is enforced on writes', async () => {
    const list = await (await call('admin', '/ledger?order_by=id&page_size=2')).json()
    expect(list.items.map((item: { permissions: unknown }) => item.permissions)).toEqual([{ update: true, delete: true }, { update: false, delete: false }])
    const etag = (await call('admin', '/ledger/2')).headers.get('etag')!
    const patch = await call('admin', '/ledger/2', { method: 'PATCH', body: JSON.stringify({ title: 'changed' }), headers: { 'content-type': 'application/json', 'if-match': etag } })
    expect(patch.status).toBe(403)
    expect((await call('admin', '/ledger/2', { method: 'DELETE' })).status).toBe(403)
  })

  it('can be switched off per resource', async () => {
    const quiet = createAdmin({ resources: [ledger], db, authenticate: testAuthenticator, options: { rowPermissions: { except: ['ledger'] } } })
    const list = await (await quiet.request('/api/v1/ledger?page_size=1', { headers: as(1) })).json()
    expect(list.items[0]).not.toHaveProperty('permissions')
  })
})

// Neither needs a real Postgres: both were in the ERP's access-leaks test.
describe('a hidden field, to a caller who may use the resource', () => {
  // As long as "secret", because error spans show the length of what was typed.
  const bogus = 'qqqqqq'
  const shape = (text: string, name: string) => text.replaceAll(name, '<name>')
  const body = (method: string, value: unknown, headers: Record<string, string> = {}) =>
    ({ method, body: JSON.stringify(value), headers: { 'content-type': 'application/json', ...headers } })
  const refusals: Array<[string, (name: string) => { path: string; init?: RequestInit }]> = [
    ['fields', (name) => ({ path: `/ledger?fields=${name}` })],
    ['filter', (name) => ({ path: `/ledger?filter=${encodeURIComponent(`${name} > "a"`)}` })],
    ['order_by', (name) => ({ path: `/ledger?order_by=${name}` })],
    ['facets', (name) => ({ path: `/ledger:facets?field=${name}` })],
    ['histogram', (name) => ({ path: `/ledger:histogram?field=${name}` })],
    ['series', (name) => ({ path: `/ledger:series?field=${name}` })],
    ['seek', (name) => ({ path: `/ledger:seek?position=0&order_by=${name}` })],
    ['search body filter', (name) => ({ path: '/ledger:search', init: body('POST', { filter: `${name} > "a"` }) })],
    ['search body fields', (name) => ({ path: '/ledger:search', init: body('POST', { fields: [name] }) })],
    ['search body order_by', (name) => ({ path: '/ledger:search', init: body('POST', { order_by: name }) })],
    ['update', (name) => ({ path: '/ledger/1', init: body('PATCH', { [name]: 'x' }, { 'if-match': '*' }) })],
    ['create', (name) => ({ path: '/ledger', init: body('POST', { title: 't', [name]: 'x' }) })],
  ]

  it.each(refusals)('is refused on %s exactly like an unknown field', async (_, make) => {
    const [hidden, unknown] = [make('secret'), make(bogus)]
    const [a, b] = [await call('viewer', hidden.path, hidden.init), await call('viewer', unknown.path, unknown.init)]
    expect(a.status).toBeGreaterThanOrEqual(400)
    expect(a.status).toBe(b.status)
    expect(shape(await a.text(), 'secret')).toBe(shape(await b.text(), bogus))
  })

  it('cannot be seen changing: the ETag covers the readable fields only', async () => {
    const etags = async () => [(await call('viewer', '/ledger/1')).headers.get('etag'), (await call('admin', '/ledger/1')).headers.get('etag')]
    const [viewerBefore, adminBefore] = await etags()
    await pg.exec(`update ledger set secret = secret || '!' where id = 1`)
    try {
      const [viewerAfter, adminAfter] = await etags()
      expect(viewerAfter).toBe(viewerBefore)
      expect(adminAfter).not.toBe(adminBefore)
    } finally {
      await pg.exec(`update ledger set secret = rtrim(secret, '!') where id = 1`)
    }
  })
})
