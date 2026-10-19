import type { Kysely } from 'kysely'
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { f, resource, type AnyField } from '@protobase/schema'
import { checkComputed, computedMigration, createAdmin } from '@protobase/server'
import { openPostgresDatabase, postgresTemplateReady, type PostgresDatabase } from '../../test-support/postgres-database'

const orders = (total: AnyField = f.decimal({ precision: 12, scale: 2 }).rollup({ from: 'lines', via: 'order_id', fn: 'sum', field: 'amount' })) =>
  resource('orders')
    .table('orders')
    .fields({ id: f.integer().readOnly(), total, line_count: f.integer().rollup({ from: 'lines', via: 'order_id', fn: 'count' }) })
    .primaryKey((r) => r.id)
const lines = (amount = 'quantity * price') =>
  resource('lines')
    .table('lines')
    .fields({
      id: f.integer().readOnly(),
      order_id: f.relation('orders'),
      quantity: f.integer(),
      price: f.decimal({ precision: 10, scale: 2 }),
      amount: f.decimal({ precision: 12, scale: 2 }).formula(amount),
      deleted_at: f.timestamp().optional(),
    })
    .primaryKey((r) => r.id)
    .softDelete((r) => r.deleted_at)

describe.skipIf(!(await postgresTemplateReady('jobs')))('rollup and formula fields on Postgres', () => {
  let pg: PostgresDatabase
  let db: Kysely<any>
  const models = (order = orders(), line = lines()) => [order.toModel(), line.toModel()]
  const migrate = async (order = orders(), line = lines()) => {
    const migration = await computedMigration(db, models(order, line))
    if (migration) await pg.exec(migration)
    expect(await computedMigration(db, models(order, line))).toBeUndefined()
    await checkComputed(db, models(order, line))
  }
  const totals = async () =>
    (await sql<{ id: number; total: string; line_count: number }>`select id, total, line_count from orders order by id`.execute(db)).rows.map((row) => `${row.id}:${row.total}:${row.line_count}`)

  beforeAll(async () => {
    pg = await openPostgresDatabase('jobs')
    db = pg.db
    await pg.exec(`create table orders (id integer generated always as identity primary key);
      create table lines (id integer generated always as identity primary key, order_id integer not null references orders, quantity integer not null, price numeric(10,2) not null, deleted_at timestamptz);
      insert into orders default values; insert into orders default values;
      insert into lines (order_id, quantity, price) values (1, 2, 2.50), (1, 1, 10.00)`)
  })

  afterAll(async () => {
    await pg?.close()
  })

  it('refuses to start until the migration wrote the columns, and sets the values from what is there', async () => {
    await expect(checkComputed(db, models())).rejects.toThrow('The rollup and formula fields lines.amount, orders.total, orders.line_count are not kept by the database as declared')
    await migrate()
    expect(await totals()).toEqual(['1:15.00:2', '2:0.00:0'])
  })

  it('keeps rollups as records are written, moved, soft deleted and deleted, by any writer', async () => {
    await pg.exec('insert into lines (order_id, quantity, price) values (2, 3, 1.10)')
    expect(await totals()).toEqual(['1:15.00:2', '2:3.30:1'])
    await pg.exec('update lines set order_id = 2 where id = 1')
    expect(await totals()).toEqual(['1:10.00:1', '2:8.30:2'])
    await pg.exec('update lines set quantity = 4 where id = 1')
    expect(await totals()).toEqual(['1:10.00:1', '2:13.30:2'])
    await pg.exec('update lines set deleted_at = now() where id = 2')
    expect(await totals()).toEqual(['1:0.00:0', '2:13.30:2'])
    await pg.exec('delete from lines where id = 3')
    expect(await totals()).toEqual(['1:0.00:0', '2:10.00:1'])
  })

  it('serves them as read-only fields of the record', async () => {
    const admin = createAdmin({ resources: [orders(), lines()], db, authenticate: () => ({ user: { id: 'u1', roles: ['admin'] } }) })
    const order = await admin.request('/api/v1/orders/2')
    expect(await order.json()).toMatchObject({ id: 2, total: '10.00', line_count: 1 })
    const created = await admin.request('/api/v1/lines', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ order_id: 2, quantity: 5, price: '2.00' }) })
    expect(await created.json()).toMatchObject({ amount: '10.00' })
    expect(await totals()).toEqual(['1:0.00:0', '2:20.00:2'])
  })

  it('generates a changed formula again and writes a changed rollup again', async () => {
    await migrate(orders(f.decimal({ precision: 12, scale: 2 }).optional().rollup({ from: 'lines', via: 'order_id', fn: 'max', field: 'amount' })), lines('quantity * price * 2'))
    expect(await totals()).toEqual(['1:null:0', '2:20.00:2'])
  })
})
