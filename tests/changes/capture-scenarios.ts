import { sql, type Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import {
  changesMigration,
  checkChanges,
  coalesce,
  createAdmin,
  eventMatcher,
  jobsSchemaMigration,
  readOutbox,
  resourceChange,
} from '@protobase/server'

/** A fresh database with the jobs schema: Kysely over it, a way to run several statements as a migration does, and its end. */
export type TestDatabase = { db: Kysely<any>; exec: (text: string) => Promise<void>; close: () => Promise<void> }

const ddl = `
create schema sales;
create table sales.orders (
  id integer generated always as identity primary key,
  status text not null default 'open',
  total numeric(12, 2) not null default 0,
  paid numeric(12, 2) not null default 0,
  iban text,
  outstanding numeric(12, 2) generated always as (total - paid) stored,
  password_hash text
);`

const fields = {
  id: f.integer().readOnly(),
  status: f.enum(['open', 'paid', 'cancelled']).default('open'),
  total: f.decimal({ precision: 12, scale: 2 }),
  paid: f.decimal({ precision: 12, scale: 2 }).default('0'),
  iban: f.text().optional().sensitive(),
  outstanding: f.decimal({ precision: 12, scale: 2 }).readOnly(),
}

export const orders = resource('orders')
  .table('sales.orders')
  .fields(fields)
  .primaryKey((r) => r.id)
  .events((e, r) => [...e.crud(), e.becomes('large', 'total > 1000'), e.updated('ibanChanged', { changed: [r.iban] })])

const model = orders.toModel()
const match = eventMatcher(model, orders.eventMatches())

/** The outbox as the dispatcher reads it, and the events its changes raise. */
export const outbox = (db: Kysely<any>) => readOutbox(db, 'changes', [model], 1000)

/** The transactions that queued a dispatch job. */
export const dispatchJobs = async (db: Kysely<any>) => {
  const { rows } = await sql<{ count: string }>`select count(*)::text as count from jobs.job where name = 'changes.dispatch'`.execute(db)
  return Number(rows[0]!.count)
}

export const raised = async (db: Kysely<any>) =>
  coalesce(await outbox(db), () => ['id']).map((change) => {
    const resolved = resourceChange(model, change)
    return { events: match(resolved), operation: resolved.operation, changed: resolved.changed, actor: resolved.actor, after: resolved.after }
  })


const api = (db: Kysely<any>) =>
  createAdmin({ resources: [orders], db, authenticate: (request) => ({ user: { id: request.headers.get('x-user') ?? 'u1', roles: ['admin'] } }) })

/** Capture on one database: the migration, writes from the API and from elsewhere, and the startup check. */
export const captureScenarios = (connect: () => Promise<TestDatabase>) => {
  let database: TestDatabase
  let db: Kysely<any>
  beforeAll(async () => {
    database = await connect()
    db = database.db
    const jobs = await jobsSchemaMigration(db)
    if (jobs) await database.exec(jobs)
    await database.exec(ddl)
  })

  const migrate = async (models = [model]) => {
    const text = await changesMigration(db, models)
    if (text) await database.exec(text)
    return text
  }
  afterAll(async () => {
    await database.close()
  })

  const clear = async () => {
    await sql`truncate changes.outbox`.execute(db)
    await sql`delete from jobs.job where name = 'changes.dispatch'`.execute(db)
  }

  describe('the migration', () => {
    it('is refused at startup before it is applied, and has nothing more to do after', async () => {
      await expect(checkChanges(db, [model])).rejects.toThrow('The changes of orders are not captured')
      expect(await migrate()).toContain('create trigger "orders_changes_update"')
      await checkChanges(db, [model])
      expect(await changesMigration(db, [model])).toBeUndefined()
    })
  })

  describe('capture', () => {
    it('records an API transaction once per record, with its actor and without sensitive values', async () => {
      await clear()
      const response = await api(db).request('/api/v1:batchWrite', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-user': 'u_12' },
        body: JSON.stringify({
          ops: [
            { op: 'create', resource: 'orders', ref: 'a', data: { total: '0', iban: 'NL00BANK0123456789' } },
            { op: 'update', resource: 'orders', key: { $ref: 'a' }, etag: '*', data: { total: '1200' } },
            { op: 'create', resource: 'orders', data: { total: '50' } },
          ],
        }),
      })
      expect(response.status).toBe(200)
      const rows = await outbox(db)
      expect(rows).toHaveLength(3)
      expect(new Set(rows.map((row) => row.transaction)).size).toBe(1)
      expect(rows.map((row) => row.actor)).toEqual(Array(3).fill({ id: 'u_12', roles: ['admin'] }))
      expect(rows[1]!.changed).toEqual(['total', 'outstanding'])
      expect(JSON.stringify(rows)).not.toContain('NL00BANK')
      expect(JSON.stringify(rows)).not.toContain('password_hash')
      expect(await raised(db)).toEqual([
        { events: ['orders.created', 'orders.large'], operation: 'create', changed: [], actor: { id: 'u_12', roles: ['admin'] }, after: expect.objectContaining({ total: '1200.00', outstanding: '1200.00' }) },
        { events: ['orders.created'], operation: 'create', changed: [], actor: { id: 'u_12', roles: ['admin'] }, after: expect.objectContaining({ total: '50.00' }) },
      ])
      expect(await dispatchJobs(db)).toBe(1)
    })

    it('records writes from outside the API without an actor, generated columns and changed sensitive fields included', async () => {
      await clear()
      await sql`update sales.orders set status = 'paid', paid = total, iban = 'NL99' where total = 1200`.execute(db)
      expect(await raised(db)).toEqual([
        { events: ['orders.updated', 'orders.ibanChanged'], operation: 'update', changed: ['status', 'paid', 'iban', 'outstanding'], actor: null, after: expect.objectContaining({ status: 'paid', outstanding: '0.00' }) },
      ])
      expect(await dispatchJobs(db)).toBe(1)
    })

    it('records nothing for a no-op update, a rollback, capture turned off, a rolled-back savepoint, or a column outside the model', async () => {
      await clear()
      await sql`update sales.orders set status = status`.execute(db)
      await sql`update sales.orders set password_hash = 'x'`.execute(db)
      await db.transaction().execute(async (trx) => {
        await sql`set local changes.capture = 'off'`.execute(trx)
        await sql`update sales.orders set total = total + 1`.execute(trx)
      })
      await expect(
        db.transaction().execute(async (trx) => {
          await sql`insert into sales.orders (total) values (5)`.execute(trx)
          throw new Error('rolled back')
        }),
      ).rejects.toThrow('rolled back')
      await db.transaction().execute(async (trx) => {
        await sql`savepoint s`.execute(trx)
        await sql`insert into sales.orders (total) values (6)`.execute(trx)
        await sql`rollback to savepoint s`.execute(trx)
        await sql`insert into sales.orders (total) values (7)`.execute(trx)
      })
      expect((await raised(db)).map((change) => [change.events, change.after?.total])).toEqual([[['orders.created'], '7.00']])
      expect(await dispatchJobs(db)).toBe(1)
    })

    it('records a delete, and nothing for an insert deleted in the same transaction', async () => {
      await clear()
      await db.transaction().execute(async (trx) => {
        await sql`insert into sales.orders (total) values (8)`.execute(trx)
        await sql`delete from sales.orders where total = 8`.execute(trx)
      })
      await sql`delete from sales.orders where total = 7`.execute(db)
      expect((await raised(db)).map((change) => change.events)).toEqual([['orders.deleted']])
      expect(await dispatchJobs(db)).toBe(2)
    })
  })

  describe('the startup check', () => {
    it('refuses a trigger that a field change made stale, until the next migration', async () => {
      const notSensitive = resource('orders').table('sales.orders').fields({ ...fields, iban: f.text().optional() }).primaryKey((r) => r.id).events((e) => e.crud()).toModel()
      await expect(checkChanges(db, [notSensitive])).rejects.toThrow('The changes of orders are not captured')
      await migrate([notSensitive])
      await checkChanges(db, [notSensitive])
      await migrate()
    })

    it('drops the triggers of a resource without events, and then captures nothing', async () => {
      await clear()
      const withoutEvents = resource('orders').table('sales.orders').fields(fields).primaryKey((r) => r.id).toModel()
      expect(await migrate([withoutEvents])).toContain('drop trigger if exists "orders_changes"')
      await checkChanges(db, [withoutEvents])
      await sql`insert into sales.orders (total) values (9)`.execute(db)
      expect(await outbox(db)).toEqual([])
      await migrate()
    })
  })
}
