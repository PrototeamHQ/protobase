import type { Kysely } from 'kysely'
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { f, resource, type AnyField, type ResourceModel } from '@protobase/schema'
import { createAdmin, neededModules } from '@protobase/server'
import { moduleDifference, retiredDifference, schemaModules, type ModuleModel } from '@protobase/server/internal'
import { openPostgresDatabase, postgresTemplateReady, statementTimeoutMs, type PostgresDatabase } from '../../test-support/postgres-database'

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

// Orders with the count alone, once their total is no longer a rollup.
const countOnly = resource('orders').table('orders').fields({ id: f.integer().readOnly(), line_count: f.integer().rollup({ from: 'lines', via: 'order_id', fn: 'count' }) }).primaryKey((r) => r.id)

describe.skipIf(!(await postgresTemplateReady('jobs')))('rollup and formula fields on Postgres', () => {
  let pg: PostgresDatabase
  let db: Kysely<any>
  type Builder = { toModel: () => ResourceModel }
  const models = (order: Builder = orders(), line: Builder = lines()) => [order.toModel(), line.toModel()]
  // The computed module as the snapshot holds it, migrated as `protobase migration` writes it, its `.after.sql` run
  // once the migration commits.
  let applied: ModuleModel | undefined
  const written = (resources: ResourceModel[]) => {
    const input = neededModules({ models: resources, views: [], jobs: [], signIn: false }).computed
    return input ? moduleDifference(schemaModules.computed, input, applied) : retiredDifference(schemaModules.computed, applied!)
  }
  const migrate = async (order: Builder = orders(), line: Builder = lines()) => {
    const { sql: text, after, model } = written(models(order, line))
    if (text) await pg.exec(text)
    if (after) await pg.exec(after)
    applied = model
    expect(written(models(order, line)).sql).toBeUndefined()
    return { text, after }
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

  it('reads none of it before the migration, which adds the columns and sets the values from what is there', async () => {
    expect(await schemaModules.computed.read(db, neededModules({ models: models(), views: [], jobs: [], signIn: false }).computed!)).toBeUndefined()
    const { after } = await migrate()
    expect(after).toContain('update "public"."orders" as p set "total"')
    expect(await totals()).toEqual(['1:15.00:2', '2:0.00:0'])
  })

  it('reads what the migration made as current, as a baseline records it', async () => {
    const input = neededModules({ models: models(), views: [], jobs: [], signIn: false }).computed!
    expect(moduleDifference(schemaModules.computed, input, await schemaModules.computed.read(db, input)).sql).toBeUndefined()
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
    const admin = createAdmin({ resources: [orders(), lines()], db, authenticate: () => ({ user: { id: 'u1', roles: ['admin'] } }), options: { statementTimeoutMs } })
    const order = await admin.request('/api/v1/orders/2')
    expect(await order.json()).toMatchObject({ id: 2, total: '10.00', line_count: 1 })
    const created = await admin.request('/api/v1/lines', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ order_id: 2, quantity: 5, price: '2.00' }) })
    expect(await created.json()).toMatchObject({ amount: '10.00' })
    expect(await totals()).toEqual(['1:0.00:0', '2:20.00:2'])
  })

  it('generates a changed formula again and writes a changed rollup again, dropping what it replaces first', async () => {
    const { text } = await migrate(orders(f.decimal({ precision: 12, scale: 2 }).optional().rollup({ from: 'lines', via: 'order_id', fn: 'max', field: 'amount' })), lines('quantity * price * 2'))
    expect(text).toMatch(/drop function if exists "rollups"\."orders_total"\(\) cascade;[\s\S]*alter table "public"\."lines" drop column "amount";[\s\S]*add column "amount"/)
    expect(await totals()).toEqual(['1:null:0', '2:20.00:2'])
  })

  it("drops a removed rollup's function and trigger, and keeps its column", async () => {
    const { text } = await migrate(countOnly)
    expect(text).toContain('drop function if exists "rollups"."orders_total"() cascade')
    const functions = await sql<{ name: string }>`select proname as name from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'rollups' order by proname`.execute(db)
    expect(functions.rows.map(({ name }) => name)).toEqual(['orders_line_count'])
    expect((await sql<{ found: boolean }>`select exists (select from information_schema.columns where table_name = 'orders' and column_name = 'total') as found`.execute(db)).rows[0]!.found).toBe(true)
  })

  it('creates a time rollup of a timestamp column without a zone, compared in its own type, and fills it once the migration commits', async () => {
    await pg.exec(`create table visits (id integer generated always as identity primary key, seen_at timestamp not null, page varchar(40) not null);
      insert into visits (seen_at, page) values ('2026-07-01 10:05', 'home'), ('2026-07-01 10:55', 'home'), ('2026-07-01 11:00', 'about')`)
    const visits = resource('visits').table('visits').fields({ id: f.integer().readOnly(), seen_at: f.timestamp(), page: f.text() }).primaryKey((r) => r.id)
    const hourly = resource('visits_hourly').table('visits_hourly').bucketsOf(visits, { time: (r) => r.seen_at, every: 'hour', by: (r) => [r.page], late: '1 hour' })
    const all = [...models(countOnly), visits.toModel(), hourly.toModel()]
    const input = neededModules({ models: all, views: [], jobs: [], signIn: false }).computed!
    const { sql: text, after } = moduleDifference(schemaModules.computed, input, applied)
    await pg.exec(text!)
    expect(after).toBe('-- The table and refresh function of a time rollup of visits_hourly.\nselect "rollups"."visits_hourly_refresh"(\'-infinity\');')
    await pg.exec(after!)
    const rows = await sql<{ bucket: string; page: string; events: string }>`select bucket::text, page, events::text from visits_hourly order by bucket`.execute(db)
    expect(rows.rows).toEqual([
      { bucket: '2026-07-01 10:00:00+00', page: 'home', events: '2' },
      { bucket: '2026-07-01 11:00:00+00', page: 'about', events: '1' },
    ])
    const page = await sql<{ type: string }>`select format_type(atttypid, atttypmod) as type from pg_attribute where attrelid = 'visits_hourly'::regclass and attname = 'page'`.execute(db)
    expect(page.rows[0]!.type).toBe('character varying(40)')
    const source = await sql<{ source: string }>`select prosrc as source from pg_proc where proname = 'visits_hourly_refresh'`.execute(db)
    expect(source.rows[0]!.source).toContain('since "public"."visits"."seen_at"%type')
    await sql`select rollups.visits_hourly_refresh('2026-07-01 11:30+00')`.execute(db)
    expect(await schemaModules.computed.read(db, input)).toMatchObject({ resources: { time_rollups: { visits_hourly: { digest: expect.stringMatching(/.+/) } } } })
  })
})
