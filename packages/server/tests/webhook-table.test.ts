import { Kysely, sql } from 'kysely'
import { describe, expect, it, vi } from 'vitest'
import { f, resource } from '@protobase/schema'
import { createAuth } from '../src/better-auth/create-auth'
import { addMember, createOrganization } from '../src/better-auth/organizations/host'
import { createUser, setUserBanned } from '../src/better-auth/users'
import { betterAuthOwnerRoles } from '../src/webhooks/table/owner-roles'
import { checkWebhooksSchema, webhooksMigration } from '../src/webhooks/table/schema'
import { tableSubscriptions } from '../src/webhooks/table/table-subscriptions'
import { subscriptionUrlCheck, subscriptionWriteCheck } from '../src/webhooks/table/validate-hook'
import { checkWebhookUrl } from '../src/webhooks/table/address-check'
import { createAdmin } from '../src/create-admin'
import { configExports } from '../src/resource-source'
import { webhooksModule } from '../src/webhooks/table/webhooks-module'
import type { WriteEvent } from '../src/types'
import { openSnapshotDb, settled, type SnapshotDb } from '../../../test-support/sql-snapshot'
import { as, testAuthenticator } from '../../../test-support/server'

// Real scrypt hashing runs on this thread, CPU work a busy machine stretches past 5 s.
vi.setConfig({ testTimeout: 30_000 })

const orders = resource('orders')
  .table('orders')
  .fields({ id: f.integer(), total: f.decimal({ precision: 12, scale: 2 }), iban: f.text().optional().sensitive() })
  .primaryKey((r) => r.id)
  .events((e) => e.crud())
  .toModel()

describe('the webhooks schema', () => {
  it('is checked at startup, written by the migration with the delivery log when asked, then current', async () => {
    const pg = await openSnapshotDb('jobs')
    const db = new Kysely<any>({ dialect: pg.dialect })
    await expect(checkWebhooksSchema(db)).rejects.toThrow('The webhooks schema is missing or behind this version of Protobase. Write it as a migration with `protobase migration`')
    await pg.exec((await webhooksMigration(db))!)
    await checkWebhooksSchema(db)
    expect(await webhooksMigration(db)).toBeUndefined()
    await expect(checkWebhooksSchema(db, { deliveryLog: true })).rejects.toThrow('missing or behind')
    const log = await webhooksMigration(db, { deliveryLog: true })
    expect(log).toContain('create table if not exists "webhooks"."delivery_log"')
    expect(log).not.toContain('create table if not exists "webhooks"."subscriptions"')
    await pg.exec(log!)
    await checkWebhooksSchema(db, { deliveryLog: true })
    await db.destroy()
  })

  // The webhooks schema as version 1 wrote it, with only the tenant's index, and one index an app added by hand.
  const earlierSchema = `
    drop index webhooks.subscriptions_owner, webhooks.subscriptions_created_at, webhooks.subscriptions_name, webhooks.subscriptions_enabled,
      webhooks.subscriptions_last_success_at, webhooks.subscriptions_name_search, webhooks.subscriptions_url_search;
    comment on function webhooks.subscription_commands() is 'Protobase webhooks 1';
    comment on function webhooks.deliveries_resend() is 'Protobase webhooks 1';
    create index subscriptions_name on webhooks.subscriptions (name);
  `
  const listReads = ['order_by=created_at desc', 'order_by=name asc', 'order_by=name desc', 'order_by=last_success_at asc', 'order_by=last_success_at desc', 'filter=enabled = true', 'filter=search("x")']

  it("serves every read of the subscriptions list on a fresh schema, and gives an earlier one the indexes of the subscriptions list's reads, once each, so none is refused", async () => {
    const pg = await openSnapshotDb('jobs')
    const db = new Kysely<any>({ dialect: pg.dialect })
    const { resources, views } = configExports(webhooksModule())
    const statuses = async () => {
      const admin = createAdmin({ resources, views, db, authenticate: testAuthenticator })
      const answers = []
      for (const read of listReads) answers.push((await admin.request(`/api/v1/webhook_subscriptions?${encodeURI(read)}`, { headers: as(1) })).status)
      return answers
    }
    await pg.exec((await webhooksMigration(db))!)
    expect(await statuses()).toEqual([200, 200, 200, 200, 200, 200, 200])
    await pg.exec(earlierSchema)
    expect(await statuses()).toEqual([400, 200, 200, 400, 400, 400, 400])
    await expect(checkWebhooksSchema(db)).rejects.toThrow('missing or behind')
    const next = await webhooksMigration(db)
    expect(next).not.toContain('create table if not exists "webhooks"."subscriptions"')
    await pg.exec(next!)
    await checkWebhooksSchema(db)
    const indexes = await sql<{ name: string }>`select indexname as name from pg_indexes where schemaname = 'webhooks' and tablename = 'subscriptions' order by indexname`.execute(db)
    expect(indexes.rows.map((row) => row.name)).toEqual([
      'subscriptions_created_at', 'subscriptions_enabled', 'subscriptions_last_success_at', 'subscriptions_name', 'subscriptions_name_search',
      'subscriptions_owner', 'subscriptions_pkey', 'subscriptions_tenant', 'subscriptions_url_search',
    ])
    expect(await statuses()).toEqual([200, 200, 200, 200, 200, 200, 200])
    await db.destroy()
  })

  it('keeps the outcome of each try on the row, disables a subscription after three days of failures, and logs every try', async () => {
    const pg = await openSnapshotDb('jobs')
    const db = new Kysely<any>({ dialect: pg.dialect })
    await pg.exec((await webhooksMigration(db, { deliveryLog: true }))!)
    // A secret of its own rather than the random default, so the recording stays the same.
    const { rows } = await sql<{ id: string }>`insert into webhooks.subscriptions (name, events, url, tenant_id, owner_id, secret) values ('a', 'orders.created', 'https://x.test', '1', 'u1', 'whsec_dGVzdA==') returning id::text`.execute(db)
    const id = rows[0]!.id
    const table = tableSubscriptions({ schema: 'webhooks', ownerRoles: async () => ['sales'], deliveryLog: true })
    expect((await table.load(db))[0]).toMatchObject({ name: `ui:${id}`, options: { events: ['orders.created'], tenant: '1', as: { roles: ['sales'] }, url: 'https://x.test' } })
    const event = { id: 'evt_1_created', type: 'orders.created', timestamp: '2026-10-11T00:00:00Z', data: {} as never }
    await table.record(db, id, event, 1, { ok: false, error: '503', status: 503, final: false }, 12)
    await sql`update webhooks.subscriptions set failing_since = now() - interval '4 days'`.execute(db)
    await table.record(db, id, event, 2, { ok: false, error: '503', status: 503, final: false }, 15)
    expect((await sql`select enabled, disabled_reason from webhooks.subscriptions`.execute(db)).rows).toEqual([{ enabled: false, disabled_reason: 'No delivery succeeded for 3 days' }])
    expect(await table.load(db)).toEqual([])
    await sql`update webhooks.subscriptions set enabled = true`.execute(db)
    expect((await sql`select failing_since, disabled_reason from webhooks.subscriptions`.execute(db)).rows).toEqual([{ failing_since: null, disabled_reason: null }])
    await table.record(db, id, event, 3, { ok: true, status: 200 }, 9)
    const log = (await sql`select status, attempt, status_code, tenant_id from webhooks.delivery_log order by id`.execute(db)).rows
    expect(log).toEqual([
      { status: 'failed', attempt: 1, status_code: 503, tenant_id: '1' },
      { status: 'failed', attempt: 2, status_code: 503, tenant_id: '1' },
      { status: 'delivered', attempt: 3, status_code: 200, tenant_id: '1' },
    ])
    await db.destroy()
  })
})

describe('subscriptionWriteCheck', () => {
  const write = (after: Record<string, unknown>) => ({ operation: 'create', resource: { name: 'webhook_subscriptions' }, user: { id: 'u1', roles: [] }, after }) as unknown as WriteEvent
  const check = subscriptionWriteCheck([orders])

  it('passes a subscription to declared events at a public address', async () => {
    await check(write({ events: 'orders.created orders.*', url: 'https://93.184.216.34/hook', filter: 'total > 10', headers: { 'x-key': 'k' } }), undefined as never)
  })

  it('refuses unknown events, a filter on a sensitive field and headers that are not text', async () => {
    await expect(check(write({ events: 'orders.shipped', url: 'https://93.184.216.34/hook' }), undefined as never)).rejects.toThrow('"orders.shipped" matches no declared event')
    await expect(check(write({ events: 'orders.created', url: 'https://93.184.216.34/hook', filter: 'iban:*' }), undefined as never)).rejects.toThrow('when uses sensitive field "iban"')
    await expect(check(write({ events: 'orders.created', url: 'https://93.184.216.34/hook', headers: { n: 1 } }), undefined as never)).rejects.toThrow('headers must be an object of text values')
    await check({ ...write({}), resource: { name: 'orders' } } as unknown as WriteEvent, undefined as never)
  })
})

describe('subscriptionUrlCheck', () => {
  const check = subscriptionUrlCheck(checkWebhookUrl)

  it('refuses a private address before the write, and leaves other bodies and resources alone', async () => {
    await expect(check({ resource: 'webhook_subscriptions', operation: 'create', body: { url: 'http://169.254.169.254/latest' } })).rejects.toThrow(
      'The webhook subscription cannot be saved: 169.254.169.254 is a private address',
    )
    await check({ resource: 'webhook_subscriptions', operation: 'update', body: { url: 'https://93.184.216.34/hook' } })
    await check({ resource: 'webhook_subscriptions', operation: 'update', body: { name: 'renamed' } })
    await check({ resource: 'webhook_subscriptions', operation: 'create', body: { url: 'not a url' } })
    await check({ resource: 'orders', operation: 'create', body: { url: 'http://127.0.0.1/' } })
  })
})

describe('betterAuthOwnerRoles', () => {
  it('reads the role someone acts with now, of their global ones and app roles in the organization they are a member of', async () => {
    const store = await (await openSnapshotDb('auth')).clone()
    // Each instance's schema check starts once its context is made; let it finish before the next queries.
    const make = async () => {
      const auth = createAuth({
        database: { dialect: store.dialect, type: 'postgres' },
        baseURL: 'http://localhost',
        secret: 'test-secret-test-secret-test-secret-1234',
        mailer: false,
        roles: { sales: 'Sales', support: 'Support' },
        organizations: { create: 'everyone' },
      })
      await auth.$context
      await settled()
      return auth
    }
    const auth = await make()
    const password = 'correct horse battery'
    const root = await createUser(auth, { email: 'root@example.com', password })
    const bo = await createUser(auth, { email: 'bo@example.com', password })
    const ana = await createUser(auth, { email: 'ana@example.com', password, role: 'support' })
    const { organization } = await createOrganization(auth, { name: 'Acme', slug: 'acme', owner: 'root@example.com' })
    await addMember(auth, { organization: 'acme', email: 'bo@example.com', appRoles: ['sales'] })
    const roles = betterAuthOwnerRoles(auth)
    expect(await roles({ id: bo.id, tenant: organization.id })).toEqual(['sales'])
    expect(await roles({ id: bo.id, tenant: 'elsewhere' })).toEqual([])
    expect(await roles({ id: ana.id, tenant: organization.id })).toEqual(['support'])
    expect((await roles({ id: root.id, tenant: organization.id })).length).toBeGreaterThan(0)
    await setUserBanned(auth, { email: 'bo@example.com', banned: true })
    expect(await roles({ id: bo.id, tenant: organization.id })).toEqual([])
    expect(await roles({ id: 'gone' })).toEqual([])
  })
})
