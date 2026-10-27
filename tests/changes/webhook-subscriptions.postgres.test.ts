import { Kysely, sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { f, resource } from '@protobase/schema'
import {
  changesMigration,
  configExports,
  createAdmin,
  startJobs,
  verifyStandardWebhook,
  webhooksMigration,
  type JobsRuntime,
  type ResourceChange,
  type SubscriptionEvent,
  type WebhooksOptions,
} from '@protobase/server'
import { webhooksModule } from '@protobase/server/internal'
import { openPostgresDatabase, postgresTemplateReady, type PostgresDatabase } from '../../test-support/postgres-database'
import { startReceiver } from './receiver'

// Workers poll and retry on real timers, which a busy machine stretches.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

const orders = resource('orders')
  .table('orders')
  .fields({
    id: f.integer().readOnly(),
    organizationId: f.integer(),
    status: f.enum(['open', 'cancelled']).default('open'),
    total: f.decimal({ precision: 12, scale: 2 }),
    cost: f.decimal({ precision: 12, scale: 2 }).default('0').access({ read: (ctx) => Boolean(ctx.user?.roles?.includes('admin')) }),
    secret_note: f.text().optional().sensitive(),
  })
  .primaryKey((r) => r.id)
  .tenant((r) => r.organizationId)
  .access({ read: (ctx) => (ctx.user?.roles?.includes('sales') ? 'status != "cancelled"' : true) })
  .events((e) => e.crud())

// Lotte is a sales admin of organization 1; Sem one of organization 2.
const people: Record<string, { tenant: number; roles: string[] }> = { lotte: { tenant: 1, roles: ['sales'] }, sem: { tenant: 2, roles: ['sales'] } }

const webhooks: WebhooksOptions = { allowPrivateAddresses: true, ownerRoles: async ({ id }) => people[id]?.roles ?? [] }

describe.skipIf(!(await postgresTemplateReady('jobs')))('webhook subscriptions made in the admin app', () => {
  let pg: PostgresDatabase
  let db: Kysely<any>
  let runtime: JobsRuntime
  let receiver: Awaited<ReturnType<typeof startReceiver>>
  let admin: ReturnType<typeof createAdmin>
  let subscription: { id: string; etag: string }
  const errors: unknown[] = []

  beforeAll(async () => {
    pg = await openPostgresDatabase('jobs')
    db = pg.db
    await pg.exec('create table orders (id integer generated always as identity primary key, organization_id integer not null, status text not null default \'open\', total numeric(12, 2) not null, cost numeric(12, 2) not null default 0, secret_note text)')
    await pg.exec('create index on orders (organization_id, status)')
    await pg.exec((await changesMigration(db, [orders.toModel()]))!)
    await pg.exec((await webhooksMigration(db, webhooks))!)
    receiver = await startReceiver()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const { resources, views } = configExports({ orders, ...webhooksModule(webhooks) })
    admin = createAdmin({
      resources,
      views,
      db,
      authenticate: (request) => {
        const id = request.headers.get('x-user')!
        const person = people[id]!
        return { user: { id, roles: person.roles }, tenant: person.tenant, organization: { id: person.tenant } }
      },
      webhooks,
    })
    runtime = await startJobs({ db, jobs: admin.jobs, pollSeconds: 0.5, shutdownSeconds: 5, onError: (error) => errors.push(error) })
  })

  afterAll(async () => {
    await runtime?.stop()
    vi.restoreAllMocks()
    await receiver?.close()
    await pg?.close()
    expect(errors).toEqual([])
  })

  const as = (user: string, path: string, init: RequestInit = {}) =>
    admin.request(`/api/v1${path}`, { ...init, headers: { 'content-type': 'application/json', 'x-user': user, ...(init.headers as Record<string, string>) } })
  const until = (check: () => unknown, timeout = 15_000) => vi.waitFor(check, { timeout, interval: 25 })
  const lotteGot = () => receiver.at('/lotte').map((request) => JSON.parse(request.body) as SubscriptionEvent)
  const row = async () => (await sql<{ secret: string; enabled: boolean; disabled_reason: string | null }>`select secret, enabled, disabled_reason from webhooks.subscriptions`.execute(db)).rows[0]!
  const update = async (values: Record<string, unknown>) => {
    const response = await as('lotte', `/webhook_subscriptions/${subscription.id}`, { method: 'PATCH', headers: { 'if-match': '*' }, body: JSON.stringify(values) })
    expect(response.status).toBe(200)
  }

  it('is created by a tenant admin, owned by them in their tenant, with a secret only a reveal shows', async () => {
    const refused = await as('lotte', '/webhook_subscriptions', { method: 'POST', body: JSON.stringify({ name: 'Orders', events: 'orders.created orders.shipped', url: receiver.url('/lotte') }) })
    expect(refused.status).toBe(400)
    expect((await refused.json()).detail).toBe('The webhook subscription cannot be saved: "orders.shipped" matches no declared event')
    const response = await as('lotte', '/webhook_subscriptions', { method: 'POST', body: JSON.stringify({ name: 'Orders', events: 'orders.created, orders.deleted', url: receiver.url('/lotte') }) })
    expect(response.status).toBe(201)
    const created = await response.json()
    expect(created).toMatchObject({ name: 'Orders', tenant_id: '1', owner_id: 'lotte', enabled: true, payload: 'full' })
    expect(created).not.toHaveProperty('secret')
    expect((await row()).secret).toMatch(/^whsec_[A-Za-z0-9+/]{43}=$/)
    subscription = { id: created.id, etag: created.etag }
    expect((await (await as('sem', '/webhook_subscriptions')).json()).items).toEqual([])
  })

  it("delivers only its tenant's records that its owner may read, with the fields they may read", async () => {
    await sql`insert into orders (organization_id, total, cost) values (2, 10, 1), (1, 20, 2), (1, 30, 3)`.execute(db)
    await sql`insert into orders (organization_id, status, total) values (1, 'cancelled', 40)`.execute(db)
    await until(() => expect(lotteGot().map((event) => event.data.after?.total).sort()).toEqual(['20.00', '30.00']))
    const [first] = receiver.at('/lotte')
    const signed = new Request('http://receiver.test', { method: 'POST', headers: first!.headers, body: first!.body })
    expect(JSON.parse(await verifyStandardWebhook(signed, { secret: (await row()).secret })).data).toMatchObject({ tenant: 1, after: { organizationId: 1, status: 'open' } })
    expect(lotteGot().every((event) => !('cost' in (event.data.after ?? {})))).toBe(true)
  })

  it('sends a test event, and after a rotation signs with the new and the old secret', async () => {
    const old = (await row()).secret
    await update({ send_test: true })
    await until(() => expect(lotteGot().filter((event) => event.test)).toHaveLength(1))
    expect(lotteGot().find((event) => event.test)).toMatchObject({ type: 'orders.created', data: { resource: 'orders', after: { organizationId: 1 } } })
    await update({ rotate_secret: true })
    const rotated = (await row()).secret
    expect(rotated).not.toBe(old)
    await update({ send_test: true })
    await until(() => expect(lotteGot().filter((event) => event.test)).toHaveLength(2))
    const last = receiver.at('/lotte').at(-1)!
    for (const secret of [old, rotated]) {
      const request = new Request('http://receiver.test', { method: 'POST', headers: last.headers, body: last.body })
      expect(JSON.parse(await verifyStandardWebhook(request, { secret })).test).toBe(true)
    }
  })

  it('lists a waiting delivery to its tenant only, and disables the subscription when the receiver is gone', async () => {
    receiver.failNext('/lotte', 503)
    await sql`delete from orders where total = 20`.execute(db)
    await until(async () => {
      const { items } = await (await as('lotte', '/webhook_deliveries')).json()
      expect(items.map((item: Record<string, unknown>) => [item.event_type, item.status, item.attempt, item.last_error])).toEqual([['orders.deleted', 'waiting', 2, '503: down for maintenance']])
    })
    expect((await (await as('sem', '/webhook_deliveries')).json()).items).toEqual([])
    receiver.failNext('/lotte', 410)
    await sql`insert into orders (organization_id, total) values (1, 50)`.execute(db)
    await until(async () => expect(await row()).toMatchObject({ enabled: false, disabled_reason: 'The receiver answered 410 Gone' }))
  })

  // Changes and events stored by an earlier dispatch: of tenant 1's open order 3 or cancelled order 4, or tenant 2's
  // order 1, holding a value of `secret_note` captured before it became sensitive.
  const captured = 'captured-secret'
  const orderRecord = (id: number) => ({ 1: { id: 1, organizationId: 2, status: 'open', total: '10.00' }, 3: { id: 3, organizationId: 1, status: 'open', total: '30.00' }, 4: { id: 4, organizationId: 1, status: 'cancelled', total: '40.00' } })[id]!
  const storedChange = (id: number, sequence: string, resource = 'orders'): ResourceChange => ({
    resource, key: String(id), operation: 'create', after: { ...orderRecord(id), secret_note: captured }, changed: [], actor: null, source: 'database', databaseRole: null,
    tenant: orderRecord(id).organizationId, transaction: '1', sequence, at: '2026-10-27T00:00:00.000Z',
  })
  const storedEvent = (id: number, sequence: string, resource = 'orders'): SubscriptionEvent => {
    const { after, tenant, transaction, actor, source, changed, key, operation } = storedChange(id, sequence, resource)
    return { id: `evt_${sequence}_created`, type: 'orders.created', timestamp: '2026-10-27T00:00:00.000Z', data: { resource, operation, key, sequence, after: after!, changed, tenant: tenant!, actor, source, transaction } }
  }
  const name = () => `ui:${subscription.id}`
  const enqueue = async (job: string, payload: unknown, group: string | null = null) =>
    (await sql<{ id: string }>`select jobs.enqueue(${job}, ${JSON.stringify(payload)}::jsonb, null, null, ${group}) as id`.execute(db)).rows[0]!.id
  const state = async (id: string) => (await sql<{ state: string }>`select state from jobs.job where id = ${id}`.execute(db)).rows[0]?.state
  const settled = async (id: string, expected = 'completed') => until(async () => expect(await state(id)).toBe(expected))
  // A failed job keeps its queue's retry delay, which a resend waits out: as if it were sent later.
  const resend = async (id: string) => {
    await sql`update jobs.job set start_after = now() where id = ${id}`.execute(db)
    await update({ resend_failed: true })
  }
  const deliveriesOf = async (sequence: string) =>
    Number((await sql<{ count: string }>`select count(*)::text as count from jobs.job where name like 'webhooks.deliver%' and data::text like ${`%evt_${sequence}_%`}`.execute(db)).rows[0]!.count)
  const sent = (sequence: string) => receiver.at('/lotte').filter((request) => (JSON.parse(request.body) as SubscriptionEvent).data.sequence === sequence)
  const keptFor = async (id: number, sequence: string, subscriptionName = name()) => settled(await enqueue('webhooks.dispatch-change', { change: storedChange(id, sequence), subscription: subscriptionName }))
  const withRoles = async (roles: string[] | undefined, run: () => Promise<unknown>) => {
    const was = people.lotte!
    if (roles) people.lotte = { ...was, roles }
    else delete people.lotte
    try {
      await run()
    } finally {
      people.lotte = was
    }
  }

  it('routes a kept change by the table subscription and its owner as they are now', async () => {
    // The earlier tests' waiting retries would take the failures the tests below queue on the receiver.
    await sql`delete from jobs.job where name like 'webhooks.deliver%' and state in ('created', 'retry')`.execute(db)
    await update({ enabled: true })
    await withRoles(['admin'], async () => {
      await keptFor(4, 'k1')
      await until(() => expect(sent('k1')).toHaveLength(1))
    })
    await keptFor(3, 'k2')
    await until(() => expect(sent('k2')).toHaveLength(1))
    expect(JSON.parse(sent('k2')[0]!.body).data.after).toEqual(orderRecord(3))
    // Demoted to sales, she may not read the cancelled order; nor tenant 2's; nor anything without roles, or once she is gone.
    for (const [roles, id, sequence] of [[['sales'], 4, 'k3'], [['sales'], 1, 'k4'], [[], 3, 'k5'], [undefined, 3, 'k6']] as const) {
      await withRoles(roles && [...roles], () => keptFor(id, sequence))
      expect(await deliveriesOf(sequence), sequence).toBe(0)
    }
    await update({ enabled: false })
    await keptFor(3, 'k7')
    expect(await deliveriesOf('k7')).toBe(0)
    await update({ enabled: true })
    expect(receiver.received.some((request) => request.body.includes(captured))).toBe(false)
  })

  it("sends a delivery's tries and resends without a field that became sensitive, signed over what is sent", async () => {
    receiver.failNext('/lotte', 500)
    await enqueue('webhooks.deliver', { subscription: name(), event: storedEvent(3, 'd1'), attempt: 1 })
    await until(() => expect(sent('d1')).toHaveLength(1))
    const [first] = sent('d1')
    const verified = await verifyStandardWebhook(new Request('http://receiver.test', { method: 'POST', headers: first!.headers, body: first!.body }), { secret: (await row()).secret })
    expect(JSON.parse(verified).data.after).toEqual(orderRecord(3))
    const next = async () => (await sql<{ data: unknown }>`select data from jobs.job where name = 'webhooks.deliver' and data ->> 'attempt' = '2' and data -> 'event' ->> 'id' = 'evt_d1_created'`.execute(db)).rows
    await until(async () => expect(await next()).toHaveLength(1))
    expect(JSON.stringify(await next())).not.toContain(captured)
    await until(() => expect(sent('d1')).toHaveLength(2), 20_000)

    // Failed for good, then resent by its owner: once while she may read the record, once after it became sensitive to her.
    await withRoles(['admin'], async () => {
      receiver.failNext('/lotte', 500)
      const failed = await enqueue('webhooks.deliver', { subscription: name(), event: storedEvent(4, 'd2'), attempt: 10 })
      await settled(failed, 'failed')
      await resend(failed)
      await settled(failed)
      expect(sent('d2')).toHaveLength(2)
    })
    await withRoles(['admin'], async () => {
      receiver.failNext('/lotte', 500)
      await settled(await enqueue('webhooks.deliver', { subscription: name(), event: storedEvent(4, 'd3'), attempt: 10 }), 'failed')
    })
    const demoted = (await sql<{ id: string }>`select id from jobs.job where data -> 'event' ->> 'id' = 'evt_d3_created'`.execute(db)).rows[0]!.id
    await resend(demoted)
    await settled(demoted)
    expect(sent('d3')).toHaveLength(1)
    const waiting = await sql<{ data: unknown }>`select data from jobs.job where name like 'webhooks.deliver%' and state in ('created', 'retry')`.execute(db)
    expect(JSON.stringify(waiting.rows)).not.toContain(captured)
    expect(receiver.received.some((request) => request.body.includes(captured))).toBe(false)
    for (const request of [...sent('d1'), ...sent('d2')]) expect(JSON.parse(request.body).data.after).toMatchObject({ id: expect.any(Number), organizationId: 1, total: expect.any(String) })
  })

  it('sends the ordered deliveries of a job and its retry without a field that became sensitive', async () => {
    receiver.failNext('/lotte', 200, 500)
    const events = [storedEvent(3, 'o1'), storedEvent(3, 'o2'), storedEvent(3, 'o3')]
    await enqueue('webhooks.deliver-ordered', { subscription: name(), events }, `${name()}:orders:3`)
    await until(() => expect(sent('o3')).toHaveLength(1), 20_000)
    expect(sent('o2')).toHaveLength(2)
    expect(receiver.received.some((request) => request.body.includes(captured))).toBe(false)
  })

  it('fails a kept change or delivery of a resource the app no longer has, sending nothing', async () => {
    const before = receiver.received.length
    const kept = await enqueue('webhooks.dispatch-change', { change: storedChange(3, 'g1', 'gone'), subscription: name() })
    const delivery = await enqueue('webhooks.deliver', { subscription: name(), event: storedEvent(3, 'g2', 'gone'), attempt: 1 })
    const ordered = await enqueue('webhooks.deliver-ordered', { subscription: name(), events: [storedEvent(3, 'g3'), storedEvent(3, 'g4', 'gone'), storedEvent(3, 'g5')] }, `${name()}:orders:3`)
    for (const id of [kept, delivery, ordered]) await settled(id, 'failed')
    const errors = await sql<{ message: string }>`select output ->> 'message' as message from jobs.job where id = any(${[kept, delivery, ordered]}::uuid[])`.execute(db)
    expect(errors.rows.map((row) => row.message)).toEqual(Array(3).fill('The resource "gone" no longer exists'))
    expect(receiver.received.length).toBe(before)
    for (const sequence of ['g1', 'g2', 'g3']) expect(await deliveriesOf(sequence)).toBe(sequence === 'g1' ? 0 : 1)
  })

  it('routes nothing to table subscriptions whose filter reads a field that became sensitive', async () => {
    const made = await sql<{ id: string }>`insert into webhooks.subscriptions (name, events, url, filter, tenant_id, owner_id)
      select 'Stale ' || value, events, url, 'secret_note = "' || value || '"', tenant_id, owner_id from webhooks.subscriptions, unnest(array[${captured}, 'other']) as value
      where id = ${subscription.id} returning id::text as id`.execute(db)
    for (const [index, { id }] of made.rows.entries()) await keptFor(3, `f${index}`, `ui:${id}`)
    expect([await deliveriesOf('f0'), await deliveriesOf('f1')]).toEqual([0, 0])
    await sql`delete from webhooks.subscriptions where id = any(${made.rows.map((row) => row.id)}::uuid[])`.execute(db)
  })

  it('shows its owner no kept change, and no stored value, among failed jobs and deliveries', async () => {
    expect(await sql`select 1 from jobs.failed where name = 'webhooks.dispatch-change' and payload::text like ${`%${captured}%`}`.execute(db).then((result) => result.rows)).toHaveLength(1)
    const failedJobs = await as('lotte', '/failed_jobs')
    expect(failedJobs.status).not.toBe(200)
    const deliveries = await as('lotte', '/webhook_deliveries')
    const body = await deliveries.text()
    expect(deliveries.status).toBe(200)
    expect(JSON.parse(body).items.length).toBeGreaterThan(0)
    expect(body).not.toContain(captured)
    expect(body).not.toContain('dispatch-change')
    expect(await failedJobs.text()).not.toContain(captured)
  })

  it('routes a kept change nowhere once its table subscription is deleted', async () => {
    expect((await as('lotte', `/webhook_subscriptions/${subscription.id}`, { method: 'DELETE', headers: { 'if-match': '*' } })).status).toBe(204)
    await keptFor(3, 'x1')
    expect(await deliveriesOf('x1')).toBe(0)
  })
})
