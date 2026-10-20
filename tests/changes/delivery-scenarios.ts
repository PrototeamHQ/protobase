import { sql, type Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { f, resource } from '@protobase/schema'
import {
  changesMigration,
  createAdmin,
  defineFunction,
  jobsSchemaMigration,
  newWebhookSecret,
  startJobs,
  subscription,
  verifyStandardWebhook,
  type JobsRuntime,
  type SubscriptionEvent,
} from '@protobase/server'
import type { TestDatabase } from './capture-scenarios'
import { reportingDelivery } from './delivery-report'
import { startReceiver } from './receiver'

const ddl = `
create table orders (
  id integer generated always as identity primary key,
  status text not null default 'open',
  total numeric(12, 2) not null default 0,
  cost numeric(12, 2) not null default 0
);`

const orders = resource('orders')
  .table('orders')
  .fields({
    id: f.integer().readOnly(),
    status: f.enum(['open', 'paid', 'cancelled']).default('open'),
    total: f.decimal({ precision: 12, scale: 2 }),
    cost: f.decimal({ precision: 12, scale: 2 }).default('0').access({ read: (ctx) => Boolean(ctx.user?.roles?.includes('admin')) }),
  })
  .primaryKey((r) => r.id)
  .access({ read: (ctx) => (ctx.user?.roles?.includes('sales') ? 'status != "cancelled"' : true) })
  .events((e) => [...e.crud(), e.becomes('large', 'total > 1000')])

const secret = newWebhookSecret()

/**
 * Delivery on one database: the API's writes and others, signed and shaped for each subscriber, retried, delivered
 * again after a dispatch that did not record, and in order for an ordered subscription.
 */
export const deliveryScenarios = (connect: () => Promise<TestDatabase>) => {
  let database: TestDatabase
  let db: Kysely<any>
  let runtime: JobsRuntime
  let receiver: Awaited<ReturnType<typeof startReceiver>>
  let admin: ReturnType<typeof createAdmin>
  const logged: string[] = []
  const errors: unknown[] = []
  const ordered: SubscriptionEvent[] = []
  const called: SubscriptionEvent[] = []

  beforeAll(async () => {
    database = await connect()
    db = database.db
    const jobs = await jobsSchemaMigration(db)
    if (jobs) await database.exec(jobs)
    await database.exec(ddl)
    await database.exec((await changesMigration(db, [orders.toModel()]))!)
    receiver = await startReceiver()
    const log = vi.spyOn(console, 'log').mockImplementation((line: string) => void logged.push(line))
    admin = createAdmin({
      resources: [orders],
      db,
      authenticate: (request) => ({ user: { id: request.headers.get('x-user') ?? 'u1', roles: ['admin'] } }),
      // A function as it would take a webhook from outside: public, checking the signature.
      functions: {
        'sync-order': defineFunction({ public: true }, async (request) => {
          called.push(JSON.parse(await verifyStandardWebhook(request, { secret })))
          return new Response(null, { status: 204 })
        }),
      },
      subscriptions: [
        subscription('sync', { events: ['orders.deleted'], function: 'sync-order', secret }),
        subscription('hook', { events: ['orders.created', 'orders.large'], url: receiver.url('/hook'), secret, headers: { 'x-team': 'sales' } }),
        subscription('sales', { events: ['orders.created'], url: receiver.url('/sales'), as: { roles: ['sales'] } }),
        subscription('slack', { events: ['orders.large'], url: receiver.url('/slack'), body: ({ data }) => ({ text: `Large order ${data.key}: €${data.after?.total}` }) }),
        subscription('history', { events: ['orders.updated'], ordered: true, run: (event) => void ordered.push(event) }),
      ],
    })
    runtime = await startJobs({ db, jobs: admin.jobs, pollSeconds: 0.5, shutdownSeconds: 5, onError: (error) => errors.push(error) })
    log.mockClear()
  })

  afterAll(async () => {
    await runtime?.stop()
    vi.restoreAllMocks()
    await receiver?.close()
    await database?.close()
    expect(errors).toEqual([])
  })

  const until = (check: () => unknown, timeout = 15_000) => vi.waitFor(check, { timeout, interval: 25 })
  const parsed = (path: string) => receiver.at(path).map((request) => JSON.parse(request.body) as SubscriptionEvent)
  const outboxSize = async () => Number((await sql<{ count: string }>`select count(*)::text as count from changes.outbox`.execute(db)).rows[0]!.count)

  it('delivers an API write signed, with its actor, right after it commits, and empties the outbox', async () => {
    const response = await admin.request('/api/v1/orders', { method: 'POST', headers: { 'content-type': 'application/json', 'x-user': 'u_12' }, body: JSON.stringify({ total: '1500', cost: '900' }) })
    expect(response.status).toBe(201)
    await until(() => expect(receiver.at('/hook')).toHaveLength(2))
    const typed = (type: string) => receiver.at('/hook').find((request) => JSON.parse(request.body).type === type)!
    const [created, large] = [typed('orders.created'), typed('orders.large')]
    expect(created!.headers['x-team']).toBe('sales')
    const request = new Request('http://receiver.test', { method: 'POST', headers: created!.headers, body: created!.body })
    expect(JSON.parse(await verifyStandardWebhook(request, { secret }))).toMatchObject({
      id: expect.stringMatching(/^evt_\d+_created$/),
      type: 'orders.created',
      data: { resource: 'orders', operation: 'create', key: '1', after: { id: 1, status: 'open', total: '1500.00', cost: '900.00' }, actor: { id: 'u_12', roles: ['admin'] }, source: 'api' },
    })
    expect(JSON.parse(large!.body)).toMatchObject({ type: 'orders.large' })
    await until(() => expect(receiver.at('/slack')).toHaveLength(1))
    expect(JSON.parse(receiver.at('/slack')[0]!.body)).toEqual({ text: 'Large order 1: €1500.00' })
    await until(async () => expect(await outboxSize()).toBe(0))
    // Dispatch logs its first tries once the transaction that empties the outbox has committed.
    await until(() => expect(logged).toContain(`webhook hook orders.created ${JSON.parse(created!.body).id} delivered (200)`))
  })

  it('shapes the payload for the roles a subscription delivers as, and skips records they may not read', async () => {
    await until(() => expect(parsed('/sales')).toHaveLength(1))
    expect(parsed('/sales')[0]!.data.after).toEqual({ id: 1, status: 'open', total: '1500.00' })
    await sql`insert into orders (status, total) values ('cancelled', 5), ('open', 6)`.execute(db)
    // Unordered deliveries go out in parallel, in any order.
    await until(() => expect(parsed('/hook').map((event) => event.data.key).sort()).toEqual(['1', '1', '2', '3']))
    await until(() => expect(parsed('/sales').map((event) => [event.data.key, event.data.source, event.data.actor])).toEqual([['1', 'api', { id: 'u_12', roles: ['admin'] }], ['3', 'database', null]]))
  })

  it('retries a failed delivery under the same webhook-id, and keeps nothing once it succeeds', async () => {
    receiver.failNext('/hook', 503)
    const before = receiver.at('/hook').length
    await sql`insert into orders (total) values (7)`.execute(db)
    await until(() => expect(receiver.at('/hook').length).toBe(before + 2), 20_000)
    const [failed, retried] = receiver.at('/hook').slice(before)
    expect(failed!.headers['webhook-id']).toBe(retried!.headers['webhook-id'])
    expect(logged.some((line) => line.startsWith(`webhook hook orders.created ${failed!.headers['webhook-id']} failed on try 1: 503: down for maintenance`))).toBe(true)
    await until(async () => {
      const { rows } = await sql<{ state: string }>`select state from jobs.job where name = 'webhooks.deliver' and data->>'attempt' = '2'`.execute(db)
      expect(rows.map((row) => row.state)).toEqual(['completed'])
    })
  })

  it('delivers again after a dispatch that could not record what it delivered', async () => {
    // A sequence, since the failing transaction rolls back everything else: only the first dispatch fails.
    await database.exec(`
      create sequence dispatch_tries;
      create function fail_once() returns trigger language plpgsql as $$
      begin
        if nextval('dispatch_tries') = 1 then
          raise exception 'the dispatcher died before recording';
        end if;
        return old;
      end $$;
      create trigger fail_once before delete on changes.outbox for each statement execute function fail_once();`)
    const before = receiver.at('/hook').length
    const logStart = logged.length
    await sql`insert into orders (total) values (8)`.execute(db)
    await reportingDelivery(until(() => expect(receiver.at('/hook').length).toBe(before + 2), 20_000), db, logged, logStart)
    const [first, again] = receiver.at('/hook').slice(before)
    expect([first!.headers['webhook-id'], first!.body]).toEqual([again!.headers['webhook-id'], again!.body])
    await until(async () => expect(await outboxSize()).toBe(0))
    await database.exec('drop trigger fail_once on changes.outbox')
  })

  it('delivers an ordered subscription one at a time per record, in commit order', async () => {
    for (const status of ['paid', 'open', 'cancelled', 'open']) await sql`update orders set status = ${status} where id = 2`.execute(db)
    await until(() => expect(ordered.map((event) => event.data.after?.status)).toEqual(['paid', 'open', 'cancelled', 'open']))
    const sequences = ordered.map((event) => Number(event.data.sequence))
    expect(sequences).toEqual([...sequences].sort((a, b) => a - b))
  })

  it('calls an API function in this process, signed like any other delivery', async () => {
    await sql`delete from orders where id = 3`.execute(db)
    await until(() => expect(called.map((event) => [event.type, event.data.before?.id])).toEqual([['orders.deleted', 3]]))
  })
}
