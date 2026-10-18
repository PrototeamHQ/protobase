import { Kysely } from 'kysely'
import { PGliteDialect } from 'kysely-pglite-dialect'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { defineRoles, f, resource } from '@protobase/schema'
import { createAdmin } from '@protobase/server'
import { createTrigramPg } from '../../test-support/pglite-snapshot'
import { as, testAuthenticator } from '../../test-support/server'

const roles = defineRoles<'products' | 'orders'>({
  admin: ['*'],
  erp_sync: [{ 'products.read': ['sku', 'price', 'stock'] }, { 'products.update': ['stock'] }],
  // Its create is for public forms only, so the API below still refuses it.
  anonymous: [{ 'products.read': { fields: ['name', 'price'], filter: 'published = true' } }, { 'products.create': ['name', 'sku'] }],
})

const products = resource('products')
  .table('products')
  .fields({
    id: f.integer().readOnly().filterable().sortable(),
    sku: f.text().filterable().sortable(),
    name: f.text().filterable().sortable(),
    price: f.decimal({ precision: 10, scale: 2 }).filterable().sortable(),
    cost_price: f.decimal({ precision: 10, scale: 2 }).filterable().sortable(),
    stock: f.integer().filterable(),
    published: f.boolean().filterable(),
  })
  .primaryKey((r) => r.id)
  .search((r) => [r.name, r.sku])

const orders = resource('orders').table('orders').fields({ id: f.integer().readOnly(), total: f.decimal({ precision: 10, scale: 2 }) }).primaryKey((r) => r.id)

// A storefront: anonymous visitors read published products' names and prices, an integration reads and restocks.
describe('the anonymous role and field lists through the API', () => {
  let db: Kysely<any>
  let app: ReturnType<typeof createAdmin>
  let closed: ReturnType<typeof createAdmin>

  beforeAll(async () => {
    const pg = await createTrigramPg()
    await pg.exec(`
      create table products (id integer generated always as identity primary key, sku text not null, name text not null, price numeric(10,2) not null, cost_price numeric(10,2) not null, stock integer not null, published boolean not null);
      insert into products (sku, name, price, cost_price, stock, published) values ('B-1', 'Bell', 9.50, 4.00, 12, true), ('L-1', 'Lamp', 24.00, 11.00, 3, true), ('S-1', 'Saddle', 60.00, 30.00, 0, false);
      create index on products (sku);
      create index on products (name);
      create index on products (price);
      create index on products (published);
      create index on products using gin (name gin_trgm_ops, sku gin_trgm_ops);
      create table orders (id integer generated always as identity primary key, total numeric(10,2) not null);
      insert into orders (total) values (10);
    `)
    db = new Kysely({ dialect: new PGliteDialect(pg) })
    app = createAdmin({ resources: [products, orders], db, authenticate: testAuthenticator, options: { roles } })
    closed = createAdmin({ resources: [products, orders], db, authenticate: testAuthenticator, options: { roles: defineRoles({ admin: ['*'] }) } })
  })
  afterAll(async () => { await db.destroy() })

  const get = (path: string, headers: Record<string, string> = {}, target = app) => target.request(`/api/v1${path}`, { headers })
  const patch = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    app.request(`/api/v1${path}`, { method: 'PATCH', body: JSON.stringify(body), headers: { 'content-type': 'application/json', 'if-match': '*', ...headers } })

  it('lists the listed fields of the filtered rows to a request without a token', async () => {
    const response = await get('/products?order_by=name')
    expect(response.status).toBe(200)
    const { items } = (await response.json()) as { items: Record<string, unknown>[] }
    expect(items.map(({ etag: _etag, permissions: _permissions, ...item }) => item)).toEqual([{ id: 1, name: 'Bell', price: '9.50' }, { id: 2, name: 'Lamp', price: '24.00' }])
    expect((await get('/products/3')).status).toBe(404)
    expect(await (await get('/products/1')).json()).toMatchObject({ name: 'Bell', price: '9.50' })
  })

  it('refuses unlisted fields in filters, sorts and field masks like unknown ones', async () => {
    for (const query of ['filter=cost_price%20%3E%201', 'order_by=cost_price', 'filter=stock%20%3E%200', 'fields=sku']) {
      const response = await get(`/products?${query}`)
      expect(response.status, query).toBe(400)
      expect(await response.text(), query).not.toContain('"cost_price":')
    }
    expect((await (await get('/products?filter=search(%22B-1%22)')).json()).items).toEqual([])
  })

  it('denies writes, other resources and the system endpoints without a token', async () => {
    const write = await patch('/products/1', { price: '1.00' })
    expect(write.status).toBe(401)
    expect(write.headers.get('www-authenticate')).toBe('Bearer')
    expect((await app.request('/api/v1/products', { method: 'POST', body: JSON.stringify({ name: 'Bike', sku: 'K-1' }), headers: { 'content-type': 'application/json' } })).status).toBe(401)
    expect((await get('/orders')).status).toBe(404)
    for (const path of ['/api/openapi.json', '/api/docs']) expect((await app.request(path)).status, path).toBe(401)
    const batch = { ops: [{ op: 'create', resource: 'products', data: { name: 'Bike', sku: 'K-1' } }] }
    expect((await app.request('/api/v1:batchWrite', { method: 'POST', body: JSON.stringify(batch), headers: { 'content-type': 'application/json' } })).status).toBe(401)
    expect((await (await get('/products?filter=name%20%3D%20%22Bike%22')).json()).items).toEqual([])
  })

  it('tells a request without a token what it may read, for the admin app visitors browse', async () => {
    const response = await app.request('/api/meta')
    expect(response.status).toBe(200)
    const meta = (await response.json()) as { resources: Array<{ name: string; fields: Record<string, unknown> }>; permissions: Record<string, unknown> }
    expect(meta.resources.map((model) => [model.name, Object.keys(model.fields).sort()])).toEqual([['products', ['id', 'name', 'price']]])
    expect(meta.permissions).toEqual({ products: { read: true, create: false, update: false, delete: false, conditional: [] } })
    expect((await app.request('/api/meta', { headers: { authorization: 'Bearer not-a-token' } })).status).toBe(401)
    expect((await closed.request('/api/meta')).status).toBe(401)
    expect((await app.request('/api/meta', { headers: as(undefined, 'admin') })).status).toBe(200)
  })

  it('answers 401 to an invalid token, and to no token without an anonymous role', async () => {
    expect((await get('/products', { authorization: 'Bearer not-a-token' })).status).toBe(401)
    expect((await get('/products', { authorization: 'Basic eDp5' })).status).toBe(401)
    expect((await get('/products', {}, closed)).status).toBe(401)
  })

  it('gives an integration its listed columns and lets it write only the listed one', async () => {
    const token = as(undefined, 'erp_sync')
    const { items } = (await (await get('/products?order_by=sku', token)).json()) as { items: Record<string, unknown>[] }
    expect(Object.keys(items[0]!).sort()).toEqual(['etag', 'id', 'permissions', 'price', 'sku', 'stock'])
    expect(items).toHaveLength(3)
    expect((await patch('/products/1', { stock: 11 }, token)).status).toBe(200)
    const refused = await patch('/products/1', { price: '1.00' }, token)
    expect(refused.status).toBe(400)
    expect((await refused.json()).errors[0]).toMatchObject({ field: 'price' })
  })
})
