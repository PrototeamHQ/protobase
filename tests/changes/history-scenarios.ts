import { sql, type Kysely } from 'kysely'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { f, resource, type AccessContext } from '@protobase/schema'
import { changesMigration, checkChanges, createAdmin, jobsSchemaMigration, startJobs, type JobsRuntime } from '@protobase/server'
import type { TestDatabase } from './capture-scenarios'

const ddl = `
create table orders (
  id integer generated always as identity primary key,
  status text not null default 'open',
  total numeric(12, 2) not null default 0,
  cost numeric(12, 2) not null default 0,
  iban text,
  deleted_at timestamptz
);`

const admins = (ctx: AccessContext) => Boolean(ctx.user?.roles?.includes('admin'))

const orders = resource('orders')
  .table('orders')
  .fields({
    id: f.integer().readOnly(),
    status: f.enum(['open', 'paid', 'cancelled']).default('open'),
    total: f.decimal({ precision: 12, scale: 2 }),
    cost: f.decimal({ precision: 12, scale: 2 }).default('0').access({ read: admins }),
    iban: f.text().optional().sensitive(),
    deleted_at: f.timestamp().optional().readOnly(),
  })
  .primaryKey((r) => r.id)
  .softDelete((r) => r.deleted_at)
  .access({ read: (ctx) => (ctx.user?.roles?.includes('sales') ? 'status != "cancelled"' : true), update: admins, create: admins, delete: admins })
  .history()

/** History on one database: kept for API writes and others, read back per caller, listed for admins and pruned. */
export const historyScenarios = (connect: () => Promise<TestDatabase>, { roles = false }: { roles?: boolean } = {}) => {
  let database: TestDatabase
  let db: Kysely<any>
  let runtime: JobsRuntime
  let admin: ReturnType<typeof createAdmin>
  const errors: unknown[] = []

  beforeAll(async () => {
    database = await connect()
    db = database.db
    const jobs = await jobsSchemaMigration(db)
    if (jobs) await database.exec(jobs)
    await database.exec(ddl)
    await expect(checkChanges(db, [orders.toModel()])).rejects.toThrow('The changes of orders are not captured as their events, history or live updates need')
    await database.exec((await changesMigration(db, [orders.toModel()]))!)
    await checkChanges(db, [orders.toModel()])
    admin = createAdmin({
      resources: [orders],
      db,
      authenticate: (request) => ({ user: { id: request.headers.get('x-user') ?? 'u1', roles: [request.headers.get('x-role') ?? 'admin'] } }),
      history: { days: 30 },
    })
    runtime = await startJobs({ db, jobs: admin.jobs, pollSeconds: 0.5, shutdownSeconds: 5, onError: (error) => errors.push(error) })
  })

  afterAll(async () => {
    await runtime?.stop()
    await database?.close()
    expect(errors).toEqual([])
  })

  const until = (check: () => unknown, timeout = 15_000) => vi.waitFor(check, { timeout, interval: 25 })
  const call = (path: string, init: RequestInit & { user?: string; role?: string } = {}) =>
    admin.request(`/api/v1${path}`, { ...init, headers: { 'content-type': 'application/json', 'if-match': '*', 'x-user': init.user ?? 'u_12', 'x-role': init.role ?? 'admin' } })
  const history = async (key: string, query = '', role = 'admin') => {
    const response = await call(`/orders/${key}:history${query}`, { role })
    return { status: response.status, body: (await response.json()) as { items: Array<Record<string, unknown>>; next_page_token: string } }
  }
  const kept = async () => Number((await sql<{ count: string }>`select count(*)::text as count from changes.history`.execute(db)).rows[0]!.count)

  it('keeps each change of the API and of other writers, with who made it, and reads it back newest first', async () => {
    expect((await call('/orders', { method: 'POST', body: JSON.stringify({ total: '100', cost: '60', iban: 'NL91ABNA0417164300' }) })).status).toBe(201)
    expect((await call('/orders/1', { method: 'PATCH', body: JSON.stringify({ status: 'paid', iban: 'NL02RABO0123456789' }) })).status).toBe(200)
    await sql`update orders set total = 120 where id = 1`.execute(db)
    await until(async () => expect(await kept()).toBe(3))

    const { status, body } = await history('1')
    expect(status).toBe(200)
    expect(body.next_page_token).toBe('')
    expect(body.items.map(({ id: _id, at: _at, ...item }) => item)).toEqual([
      { operation: 'update', changed: ['total'], before: expect.objectContaining({ total: '100.00' }), after: expect.objectContaining({ total: '120.00' }), actor: null, database_role: expect.any(String) },
      { operation: 'update', changed: ['status', 'iban'], before: expect.objectContaining({ status: 'open' }), after: expect.objectContaining({ status: 'paid' }), actor: { id: 'u_12' }, database_role: expect.any(String) },
      { operation: 'create', changed: [], after: { id: 1, status: 'open', total: '100.00', cost: '60.00', deleted_at: null }, actor: { id: 'u_12' }, database_role: expect.any(String) },
    ])
    expect(JSON.stringify(body)).not.toContain('NL91')
  })

  it('shows a reader only the fields they may read, and none of the changes of only other fields', async () => {
    await sql`update orders set cost = 70 where id = 1`.execute(db)
    await until(async () => expect(await kept()).toBe(4))
    expect((await history('1')).body.items[0]).toMatchObject({ changed: ['cost'] })
    const { body } = await history('1', '', 'sales')
    expect(body.items.map((item) => item.changed)).toEqual([['total'], ['status', 'iban'], []])
    expect(JSON.stringify(body)).not.toContain('cost')
  })

  it('pages with page_size and next_page_token', async () => {
    const first = await history('1', '?page_size=3')
    expect(first.body.items).toHaveLength(3)
    const rest = await history('1', `?page_size=3&page_token=${first.body.next_page_token}`)
    expect(rest.body.items.map((item) => item.operation)).toEqual(['create'])
    expect(rest.body.next_page_token).toBe('')
    expect((await history('1', '?page_token=abc')).status).toBe(400)
  })

  it('answers 404 for a record the caller may not read, and keeps the history of a soft delete', async () => {
    expect((await call('/orders/1', { method: 'DELETE' })).status).toBe(204)
    await until(async () => expect(await kept()).toBe(5))
    expect((await history('1')).body.items[0]).toMatchObject({ operation: 'delete', changed: ['deleted_at'] })
    await sql`update orders set status = 'cancelled' where id = 1`.execute(db)
    expect((await history('1', '', 'sales')).status).toBe(404)
    expect((await history('99')).status).toBe(404)
  })

  it('lists every change as Activity to admins only', async () => {
    await until(async () => expect(await kept()).toBe(6))
    const response = await call('/record_history?order_by=id desc')
    expect([response.status, response.status === 200 ? '' : await response.clone().text()]).toEqual([200, ''])
    const { items } = (await response.json()) as { items: Array<Record<string, unknown>> }
    expect(items).toHaveLength(6)
    expect(items.at(-1)).toMatchObject({ resource: 'orders', record_key: '1', operation: 'create', actor_id: 'u_12', actor_roles: ['admin'] })
    expect((await call('/record_history', { role: 'sales' })).status).toBe(404)
  })

  it.runIf(roles)('keeps the role a writer chose with set role as the database role', async () => {
    const role = `history_writer_${Math.random().toString(36).slice(2, 8)}`
    await database.exec(`create role ${role}; grant select, update on orders to ${role}`)
    await db.transaction().execute(async (trx) => {
      await sql.raw(`set local role ${role}`).execute(trx)
      await sql`update orders set total = 130 where id = 1`.execute(trx)
    })
    await until(async () => expect(await kept()).toBe(7))
    const { rows } = await sql<{ database_role: string }>`select "database_role" from changes.history order by "id" desc limit 1`.execute(db)
    expect(rows[0]!.database_role).toBe(role)
    await sql`delete from changes.history where "id" = (select max("id") from changes.history)`.execute(db)
    await database.exec(`revoke all on orders from ${role}; drop role ${role}`)
  })

  it('prunes changes older than the days kept, with a daily job', async () => {
    expect(admin.jobs.map((job) => job.name)).toContain('history.prune')
    await sql`update changes.history set "at" = now() - interval '31 days' where "operation" = 'create'`.execute(db)
    const prune = admin.jobs.find((job) => job.name === 'history.prune')!
    await prune.options.run(undefined as never, { db, signal: new AbortController().signal } as never)
    expect(await kept()).toBe(5)
  })
}
