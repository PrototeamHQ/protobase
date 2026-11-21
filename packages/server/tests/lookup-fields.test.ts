import { Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { f, resource, where, type AccessContext } from '@protobase/schema'
import { createAdmin } from '../src/index'
import { signTestToken, testAuthenticator } from '../../../test-support/server'
import { openSnapshotDb, type SnapshotDb } from '../../../test-support/sql-snapshot'

// Orders show their customer's name and email, read through their relation, and apps their runtime's release, read
// from the one runtime that points at each app. A customer is read inside its tenant, unless deleted, and an "east"
// caller reads only the east's customers; only "sales" reads their emails.

const isIn = (ctx: AccessContext, role: string) => (ctx.user!.roles as string[]).includes(role)

const customers = resource('customers')
  .table('customers')
  .fields({
    id: f.integer().filterable().sortable(),
    tenant_id: f.integer().readOnly(),
    region: f.text().filterable(),
    name: f.text().filterable().sortable(),
    email: f.text().access({ read: (ctx) => isIn(ctx, 'sales') }),
    note: f.text().optional().filterable(),
    deleted_at: f.timestamp().optional().readOnly(),
  })
  .primaryKey((r) => r.id)
  .tenant((r) => r.tenant_id)
  .softDelete((r) => r.deleted_at)
  .access({ read: (ctx) => (isIn(ctx, 'east') ? where.eq('region', 'east') : true) })

const orders = resource('orders')
  .table('orders')
  .fields({
    id: f.integer().filterable().sortable(),
    tenant_id: f.integer().readOnly(),
    customer_id: f.relation('customers').optional().filterable(),
    number: f.text(),
    customer_name: f.text().lookup({ via: 'customer_id', field: 'name' }).filterable().sortable(),
    customer_email: f.text().lookup({ via: 'customer_id', field: 'email' }),
    // No index serves the customers' notes
    customer_note: f.text().lookup({ via: 'customer_id', field: 'note' }).filterable(),
  })
  .primaryKey((r) => r.id)
  .tenant((r) => r.tenant_id)

const apps = resource('apps')
  .table('apps')
  .fields({
    id: f.integer().filterable().sortable(),
    name: f.text(),
    release: f.text().lookup({ from: 'app_runtimes', via: 'app_id', field: 'release' }).sortable(),
  })
  .primaryKey((r) => r.id)

const appRuntimes = resource('app_runtimes')
  .table('app_runtimes')
  .fields({ app_id: f.relation('apps').filterable().sortable(), release: f.text().sortable() })
  .primaryKey((r) => r.app_id)

let pg: SnapshotDb
let db: Kysely<any>
let app: ReturnType<typeof createAdmin>
beforeAll(async () => {
  pg = await openSnapshotDb('empty')
  await pg.exec(`
    create table customers (id integer primary key, tenant_id integer not null, region text not null, name text not null, email text not null, note text, deleted_at timestamptz);
    create index on customers (tenant_id, name);
    create index on customers (region);
    create table orders (id integer primary key, tenant_id integer not null, customer_id integer references customers, number text not null);
    create index on orders (customer_id);
    create table apps (id integer primary key, name text not null);
    create table app_runtimes (app_id integer primary key references apps, release text not null);
    create index on app_runtimes (release);
    insert into customers values
      (1, 1, 'east', 'Ada', 'ada@example.com', null, null), (2, 1, 'west', 'Bea', 'bea@example.com', null, null),
      (3, 1, 'east', 'Cy', 'cy@example.com', null, '2026-07-01'), (4, 2, 'east', 'Dee', 'dee@example.com', null, null);
    insert into orders values (1, 1, 2, 'A-1'), (2, 1, 1, 'A-2'), (3, 1, 3, 'A-3'), (4, 1, 4, 'A-4'), (5, 1, null, 'A-5');
    insert into apps values (1, 'shop'), (2, 'blog'), (3, 'wiki');
    insert into app_runtimes values (1, '2.0.0'), (2, '1.4.0');
  `)
  db = new Kysely({ dialect: pg.dialect })
  app = createAdmin({ resources: [customers, orders, apps, appRuntimes], db, authenticate: testAuthenticator })
})
afterAll(async () => { await db.destroy() })

const as = (role: string) => ({ authorization: `Bearer ${signTestToken({ sub: 'u1', roles: [role], tenant: 1 })}`, 'content-type': 'application/json' })
const get = (path: string, role = 'member') => app.request(`/api/v1${path}`, { headers: as(role) })
const items = async (path: string, role = 'member') => {
  const response = await get(path, role)
  expect(response.status, await response.clone().text()).toBe(200)
  return (await response.json()).items as Record<string, unknown>[]
}
const names = async (path: string, role = 'member') => (await items(path, role)).map((item) => [item.id, item.customer_name])

describe('a lookup field through the record\'s own relation', () => {
  it("shows the linked record's field, empty without a linked record the caller reads", async () => {
    expect(await names('/orders?order_by=id&fields=id,customer_name')).toEqual([[1, 'Bea'], [2, 'Ada'], [3, null], [4, null], [5, null]])
    expect(await names('/orders?order_by=id&fields=id,customer_name', 'east')).toEqual([[1, null], [2, 'Ada'], [3, null], [4, null], [5, null]])
    expect((await (await get('/orders/1')).json()).customer_name).toBe('Bea')
  })

  it('is filtered and sorted by the linked field, as the caller reads it', async () => {
    expect(await names("/orders?filter=customer_name = 'Bea'&fields=id,customer_name")).toEqual([[1, 'Bea']])
    expect(await names("/orders?filter=customer_name = 'Bea'&fields=id,customer_name", 'east')).toEqual([])
    expect((await items('/orders?filter=isNull(customer_name)&order_by=id&fields=id', 'east')).map((item) => item.id)).toEqual([1, 3, 4, 5])
    expect((await items('/orders?order_by=customer_name&fields=id')).map((item) => item.id)).toEqual([2, 1, 3, 4, 5])
  })

  it('is not there for a caller who cannot read the linked field', async () => {
    expect((await items('/orders?filter=id = 1', 'sales'))[0]).toMatchObject({ customer_email: 'bea@example.com' })
    expect((await items('/orders?filter=id = 1'))[0]).not.toHaveProperty('customer_email')
    const meta = await (await app.request('/api/meta', { headers: as('member') })).json()
    const fields = meta.resources.find((model: { name: string }) => model.name === 'orders').fields
    expect(fields.customer_name).toMatchObject({ type: 'text', readOnly: true, lookup: { via: 'customer_id', field: 'name' } })
    expect(fields).not.toHaveProperty('customer_email')
    expect(JSON.stringify(meta)).not.toContain('lookupRead')
    expect((await get("/orders?filter=customer_email = 'x'")).status).toBe(400)
  })

  it('refuses a filter on a linked field no index serves, naming the linked table', async () => {
    const response = await get("/orders?filter=customer_note = 'x'")
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ type: 'urn:protobase:problem:expensive-query', columns: [{ field: 'customers.note', column: 'note', use: 'filter', need: 'btree' }] })
  })

  it("leaves the record's ETag to its own fields, and comes back from a write", async () => {
    const read = await get('/orders/1')
    const updated = await app.request('/api/v1/orders/1', { method: 'PATCH', headers: { ...as('member'), 'if-match': read.headers.get('etag')! }, body: JSON.stringify({ number: 'A-1b' }) })
    expect(updated.status, await updated.clone().text()).toBe(200)
    expect(await updated.json()).toMatchObject({ number: 'A-1b', customer_name: 'Bea' })
    expect((await app.request('/api/v1/orders/1', { method: 'PATCH', headers: { ...as('member'), 'if-match': '*' }, body: JSON.stringify({ customer_name: 'Zed' }) })).status).toBe(400)
  })
})

describe('a lookup field of the one record of another resource that points at it', () => {
  it('shows and sorts by that record\'s field, empty without one', async () => {
    const releases = (await items('/apps?order_by=release desc&fields=id,release')).map((item) => [item.id, item.release])
    expect(releases).toEqual([[3, null], [1, '2.0.0'], [2, '1.4.0']])
  })
})
