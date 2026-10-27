import { Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { f, resource, where, type AccessFn } from '@protobase/schema'
import { createAdmin } from '../src/create-admin'
import { json, signTestToken, testAuthenticator } from '../../../test-support/server'
import { openSnapshotDb } from '../../../test-support/sql-snapshot'

type Row = { name: string; ownerId: string; status: string }

const folders = resource('folders').table('folders').fields({ id: f.integer().readOnly().filterable() }).primaryKey((r) => r.id)

const rows = (name: string, table: string, read: AccessFn) =>
  resource(name)
    .table(table)
    .fields({
      id: f.integer().readOnly().filterable().sortable(),
      folderId: f.relation('folders').optional().filterable(),
      name: f.text().filterable(),
      ownerId: f.text().filterable(),
      status: f.text().filterable(),
    })
    .primaryKey((r) => r.id)
    .search((r) => [r.name])
    .access({ read })

const items = rows('items', 'items', (_, record) => (record as Row).name !== 'hidden')
const owned = rows('owned', 'owned', (ctx, record) => (record as Row).ownerId === ctx.user!.id)
const filtered = rows('filtered', 'filtered', (ctx) => where.eq('ownerId', ctx.user!.id as string))

const invoices = resource('invoices')
  .table('invoices')
  .fields({ id: f.integer().readOnly().filterable(), customerId: f.relation('items') })
  .primaryKey((r) => r.id)

const orders = resource('orders')
  .table('orders')
  .fields({ id: f.integer().readOnly().filterable(), status: f.text() })
  .primaryKey((r) => r.id)
  .access({
    update: (_, record) => (record as { status?: string } | undefined)?.status !== 'shipped',
    delete: (_, record: any = {}) => record.status !== 'shipped',
  })

let db: Kysely<any>
let app: ReturnType<typeof createAdmin>
beforeAll(async () => {
  const pg = await openSnapshotDb('empty')
  const table = (name: string) => `create table ${name} (id integer primary key, folder_id integer references folders (id), name text not null, owner_id text not null, status text not null);
    create index on ${name} (owner_id); create index on ${name} (name); create index on ${name} (status); create index on ${name} (folder_id);`
  await pg.exec(`
    create table folders (id integer primary key);
    insert into folders values (1);
    ${table('items')}
    ${table('owned')}
    ${table('filtered')}
    insert into items values (1, 1, 'visible', 'a', 'published'), (2, 1, 'hidden', 'b', 'draft');
    insert into owned values (1, null, 'of a', 'a', 'draft'), (2, null, 'of b', 'b', 'draft');
    insert into filtered values (1, null, 'of a', 'a', 'draft'), (2, null, 'of b', 'b', 'draft'), (3, null, 'also of a', 'a', 'draft');
    create table invoices (id integer primary key, customer_id integer not null references items (id));
    insert into invoices values (1, 1), (2, 2);
    create table orders (id integer primary key, status text not null);
    insert into orders values (1, 'shipped'), (2, 'draft');
  `)
  db = new Kysely({ dialect: pg.dialect })
  app = createAdmin({ resources: [folders, items, owned, filtered, invoices, orders], db, authenticate: testAuthenticator })
})
afterAll(async () => { await db.destroy() })

const as = (user: string) => ({ authorization: `Bearer ${signTestToken({ sub: user, roles: ['member'] })}` })
const get = (path: string, user = 'a', method = 'GET') => app.request(`/api/v1${path}`, { method, headers: as(user) })
const search = (path: string, body: unknown, user = 'a') => app.request(`/api/v1${path}:search`, json(body, as(user)))

// Every way of listing a resource, as `user`.
const lists = (path: string, user: string) => [
  get(path, user),
  get(path, user, 'HEAD'),
  get(`${path}?fields=id&count=exact`, user),
  get(`${path}?page_token=${encodeURIComponent(Buffer.from('{"after":[0]}').toString('base64url'))}`, user),
  search(path, { filter: 'name = "visible" OR name = "hidden" OR name = "of a" OR name = "of b"' }, user),
  get(`${path}:seek?position=0`, user),
  get(`${path}:seek?position=1`, user),
  get(`${path}:aggregate?group_by=status`, user),
  get(`${path}?filter=${encodeURIComponent('folderId = 1')}`, user),
]

const refusedWithNothing = async (responses: Array<Response | Promise<Response>>, leaked: string[]) => {
  for (const response of await Promise.all(responses)) {
    expect(response.status).toBe(403)
    const text = await response.text()
    for (const value of [...leaked, '"items"', 'total_size', '"groups"']) expect(text).not.toContain(value)
    expect(response.headers.get('x-total-count')).toBeNull()
    expect(response.headers.get('content-range')).toBeNull()
  }
}

describe('a resource whose read rule reads the record', () => {
  it('refuses every list, :search, :seek and aggregate, with nothing of a row', async () => {
    await refusedWithNothing(lists('/items', 'a'), ['visible', 'hidden', '"id"'])
  })

  it('still reads each record by its rule, a selection of fields included', async () => {
    expect((await get('/items/1')).status).toBe(200)
    expect((await get('/items/2')).status).toBe(404)
    expect((await get('/items/2?fields=id')).status).toBe(404)
  })

  it('refuses each caller whose verdict needs the record, and their gets keep to the rule', async () => {
    await refusedWithNothing(lists('/owned', 'b'), ['of a'])
    expect((await get('/owned/1', 'b')).status).toBe(404)
    expect((await get('/owned/2', 'b')).status).toBe(200)
  })

  it('gives no labels of its records to a readable resource that points at them', async () => {
    const response = await get('/invoices?labels=customerId.name')
    expect(response.status).toBe(200)
    const text = await response.text()
    expect(text).not.toContain('visible')
    expect(text).not.toContain('hidden')
    expect(JSON.parse(text).items.map((item: { customerId: number }) => item.customerId)).toEqual([1, 2])
  })

  it('names no blocking record of it when a delete of what it points at is refused', async () => {
    const response = await app.request('/api/v1/folders/1', { method: 'DELETE', headers: { ...as('a'), 'if-match': '*' } })
    expect(response.status).toBe(409)
    expect(await response.text()).not.toContain('blockedBy')
  })
})

describe('the same rule as a row filter', () => {
  it('lists, searches, seeks and counts only the caller\'s own rows', async () => {
    for (const [user, own] of [['a', [1, 3]], ['b', [2]]] as const) {
      const listed = await (await get('/filtered?count=exact', user)).json()
      expect(listed.items.map((item: { id: number }) => item.id).sort()).toEqual(own)
      expect(listed.total_size).toBe(own.length)
      const searched = await (await search('/filtered', { filter: 'name = "of a" OR name = "of b"' }, user)).json()
      expect(searched.items.every((item: { ownerId: string }) => item.ownerId === user)).toBe(true)
      const sought = await (await get('/filtered:seek?position=0', user)).json()
      expect(sought.items.every((item: { ownerId: string }) => item.ownerId === user)).toBe(true)
      const counted = await (await get('/filtered:aggregate?group_by=status', user)).json()
      expect(counted.groups).toEqual([{ value: 'draft', count: own.length }])
    }
  })
})

describe('a write rule that reads the record without throwing', () => {
  it('is checked against the stored record, leaving a shipped order as it is', async () => {
    const write = (method: string, id: number, body?: unknown) =>
      app.request(`/api/v1/orders/${id}`, { method, headers: { ...as('a'), 'if-match': '*', 'content-type': 'application/json' }, ...(body !== undefined && { body: JSON.stringify(body) }) })
    expect((await write('PATCH', 1, { status: 'draft' })).status).toBe(403)
    expect((await write('DELETE', 1)).status).toBe(403)
    expect(await (await get('/orders/1')).json()).toMatchObject({ id: 1, status: 'shipped' })
    expect((await write('PATCH', 2, { status: 'paid' })).status).toBe(200)
  })
})
