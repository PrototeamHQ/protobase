import type { PGlite } from '@electric-sql/pglite'
import { Kysely, sql } from 'kysely'
import { PGliteDialect } from 'kysely-pglite-dialect'
import { describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { authSchemaMigration } from '../src/better-auth/auth-schema'
import { createAuth } from '../src/better-auth/create-auth'
import { addMember, createOrganization } from '../src/better-auth/organizations/host'
import { createUser, setUserBanned } from '../src/better-auth/users'
import { betterAuthOwnerRoles } from '../src/webhooks/table/owner-roles'
import { checkWebhooksSchema, webhooksMigration } from '../src/webhooks/table/schema'
import { tableSubscriptions } from '../src/webhooks/table/table-subscriptions'
import { subscriptionWriteCheck } from '../src/webhooks/table/validate-hook'
import { checkWebhookUrl } from '../src/webhooks/table/address-check'
import type { WriteEvent } from '../src/types'
import { createAuthStore } from '../../../test-support/auth'
import { createJobsPg } from '../../../test-support/jobs'

const orders = resource('orders')
  .table('orders')
  .fields({ id: f.integer(), total: f.decimal({ precision: 12, scale: 2 }), iban: f.text().optional().sensitive() })
  .primaryKey((r) => r.id)
  .events((e) => e.crud())
  .toModel()

describe('the webhooks schema', () => {
  it('is checked at startup, written by the migration with the delivery log when asked, then current', async () => {
    const pg = await createJobsPg()
    const db = new Kysely<any>({ dialect: new PGliteDialect(pg) })
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

  it('keeps the outcome of each try on the row, disables a subscription after three days of failures, and logs every try', async () => {
    const pg = await createJobsPg()
    const db = new Kysely<any>({ dialect: new PGliteDialect(pg) })
    await pg.exec((await webhooksMigration(db, { deliveryLog: true }))!)
    const { rows } = await sql<{ id: string }>`insert into webhooks.subscriptions (name, events, url, tenant_id, owner_id) values ('a', 'orders.created', 'https://x.test', '1', 'u1') returning id::text`.execute(db)
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
  const write = (after: Record<string, unknown>) => ({ operation: 'create', resource: { name: 'webhookSubscriptions' }, user: { id: 'u1', roles: [] }, after }) as unknown as WriteEvent
  const check = subscriptionWriteCheck([orders], checkWebhookUrl)

  it('passes a subscription to declared events at a public address', async () => {
    await check(write({ events: 'orders.created orders.*', url: 'https://93.184.216.34/hook', filter: 'total > 10', headers: { 'x-key': 'k' } }), undefined as never)
  })

  it('refuses unknown events, a filter on a sensitive field, headers that are not text, and a private address', async () => {
    await expect(check(write({ events: 'orders.shipped', url: 'https://93.184.216.34/hook' }), undefined as never)).rejects.toThrow('"orders.shipped" matches no declared event')
    await expect(check(write({ events: 'orders.created', url: 'https://93.184.216.34/hook', filter: 'iban:*' }), undefined as never)).rejects.toThrow('when uses sensitive field "iban"')
    await expect(check(write({ events: 'orders.created', url: 'https://93.184.216.34/hook', headers: { n: 1 } }), undefined as never)).rejects.toThrow('headers must be an object of text values')
    await expect(check(write({ events: 'orders.created', url: 'http://169.254.169.254/latest' }), undefined as never)).rejects.toThrow('169.254.169.254 is a private address')
    await check({ ...write({}), resource: { name: 'orders' } } as unknown as WriteEvent, undefined as never)
  })
})

describe('betterAuthOwnerRoles', () => {
  it('reads the roles someone holds now: global ones, and app roles in the organization they are a member of', async () => {
    const store = (await (await createAuthStore()).clone()) as PGlite
    const make = () =>
      createAuth({
        database: { dialect: new PGliteDialect(store), type: 'postgres' },
        baseURL: 'http://localhost',
        secret: 'test-secret-test-secret-test-secret-1234',
        mailer: false,
        roles: { sales: 'Sales', support: 'Support' },
        organizations: { create: 'everyone' },
      })
    await store.exec((await authSchemaMigration(make()))!)
    const auth = make()
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
