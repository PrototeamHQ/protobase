import { Kysely } from 'kysely'
import { describe, expect, it, vi } from 'vitest'
import { deliveryLogSql, subscriptionsIndexesSql, subscriptionsSql } from '../src/webhooks/table/schema-sql'
import { tableSubscriptions } from '../src/webhooks/table/table-subscriptions'
import type { SubscriptionEvent } from '../src/webhooks/subscription'
import { openPostgresDatabase, postgresTemplateReady } from '../../../test-support/postgres-database'
import { largeTable, seqScansOf, watchStatements } from '../../../test-support/query-plans'

// Each delivery of a subscription made in the admin app reads its row and records its try on it, among as many
// subscriptions as a busy app holds: by its primary key, as a uuid. Plans a recording cannot make.
vi.setConfig({ testTimeout: 60_000 })

const ready = await postgresTemplateReady('trigram')

const event: SubscriptionEvent = { id: 'event-1', type: 'orders.created', timestamp: '2026-07-01T00:00:00.000Z', data: {} as SubscriptionEvent['data'] }

describe.skipIf(!ready)('a table subscription among 100,000', () => {
  it('is found and has its tries recorded by its primary key, and an id that is no uuid names none', async () => {
    const store = await openPostgresDatabase('trigram')
    await store.exec(`create schema webhooks; ${subscriptionsSql('webhooks', 'changes')}; ${subscriptionsIndexesSql('webhooks')}; ${deliveryLogSql('webhooks')};
      ${largeTable('webhooks.subscriptions', ['id'])};
      insert into webhooks.subscriptions (id, name, events, url)
        select ('00000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, 'Subscription ' || i, 'orders.created', 'https://example.com/' || i from generate_series(1, 100000) i;
      analyze`)
    const watched = watchStatements(store)
    const db = new Kysely<any>({ dialect: watched.dialect })
    const subscriptions = tableSubscriptions({ schema: 'webhooks', ownerRoles: async () => [], deliveryLog: true })
    const id = '00000000-0000-4000-8000-000000050000'
    expect((await subscriptions.find(db, id))?.options).toMatchObject({ url: 'https://example.com/50000' })
    await subscriptions.record(db, id, event, 1, { ok: true, status: 200 }, 12)
    await subscriptions.record(db, id, event, 2, { ok: false, error: 'refused', status: 500, final: false }, 12)
    expect(await subscriptions.find(db, 'not-a-uuid')).toBeUndefined()
    await subscriptions.record(db, 'not-a-uuid', event, 1, { ok: true }, 12)
    const rows = await store.db.selectFrom('webhooks.delivery_log').select(['status', 'attempt']).orderBy('attempt').execute()
    expect(rows).toEqual([{ status: 'delivered', attempt: 1 }, { status: 'failed', attempt: 2 }])
    const plans = await watched.plansOf('subscriptions')
    expect(seqScansOf(plans, 'subscriptions')).toEqual([])
    expect(plans).toHaveLength(5)
  })
})
