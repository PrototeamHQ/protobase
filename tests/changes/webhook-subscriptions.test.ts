import { Kysely, sql } from 'kysely'
import { PGliteDialect } from 'kysely-pglite-dialect'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { f, resource } from '@protobase/schema'
import {
  changesMigration,
  configExports,
  createAdmin,
  startJobs,
  verifyStandardWebhook,
  webhooks,
  webhooksMigration,
  type JobsRuntime,
  type SubscriptionEvent,
} from '@protobase/server'
import { createJobsPg } from '../../test-support/jobs'
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
  })
  .primaryKey((r) => r.id)
  .tenant((r) => r.organizationId)
  .access({ read: (ctx) => (ctx.user?.roles?.includes('sales') ? 'status != "cancelled"' : true) })
  .events((e) => e.crud())

// Lotte is a sales admin of organization 1; Sem one of organization 2.
const people: Record<string, { tenant: number; roles: string[] }> = { lotte: { tenant: 1, roles: ['sales'] }, sem: { tenant: 2, roles: ['sales'] } }

const plugin = webhooks({ allowPrivateAddresses: true, ownerRoles: async ({ id }) => people[id]?.roles ?? [] })

describe('webhook subscriptions made in the admin app', () => {
  let db: Kysely<any>
  let runtime: JobsRuntime
  let receiver: Awaited<ReturnType<typeof startReceiver>>
  let admin: ReturnType<typeof createAdmin>
  let subscription: { id: string; etag: string }
  const errors: unknown[] = []

  beforeAll(async () => {
    const pg = await createJobsPg()
    db = new Kysely<any>({ dialect: new PGliteDialect(pg) })
    await pg.exec('create table orders (id integer generated always as identity primary key, organization_id integer not null, status text not null default \'open\', total numeric(12, 2) not null, cost numeric(12, 2) not null default 0)')
    await pg.exec('create index on orders (organization_id, status)')
    await pg.exec((await changesMigration(db, [orders.toModel()]))!)
    await pg.exec((await webhooksMigration(db, plugin.webhooks))!)
    receiver = await startReceiver()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const { resources, views } = configExports({ orders, ...plugin.config })
    admin = createAdmin({
      resources,
      views,
      db,
      authenticate: (request) => {
        const id = request.headers.get('x-user')!
        const person = people[id]!
        return { user: { id, roles: person.roles }, tenant: person.tenant, organization: { id: person.tenant } }
      },
      webhooks: plugin.webhooks!,
    })
    runtime = await startJobs({ db, jobs: admin.jobs, pollSeconds: 0.5, shutdownSeconds: 5, onError: (error) => errors.push(error) })
  })

  afterAll(async () => {
    await runtime?.stop()
    vi.restoreAllMocks()
    await receiver?.close()
    await db?.destroy()
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
})
