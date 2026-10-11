import { DummyDriver, Kysely, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler } from 'kysely'
import { describe, expect, it } from 'vitest'
import { createAdmin, defineFunction, newWebhookSecret } from '@protobase/server'
import { orders } from './orders'

// The documentation shows these files; this keeps what it says about them true.

const db = new Kysely<any>({
  dialect: { createAdapter: () => new PostgresAdapter(), createDriver: () => new DummyDriver(), createIntrospector: (kysely) => new PostgresIntrospector(kysely), createQueryCompiler: () => new PostgresQueryCompiler() },
})

const load = async () => {
  process.env.ACCOUNTING_WEBHOOK_SECRET = newWebhookSecret()
  return import('./subscriptions')
}

describe('the subscriptions of orders', () => {
  it('name declared events, a function the app has, and need no Slack URL to start', async () => {
    const { newOrdersToSlack, ordersToAccounting, rushOrders } = await load()
    expect(newOrdersToSlack.options.enabled).toBe(false)
    const admin = createAdmin({
      resources: [orders],
      db,
      authenticate: () => ({ user: { id: 1, roles: ['admin'] } }),
      functions: { 'sync-order': defineFunction({ public: true }, () => new Response(null, { status: 204 })) },
      subscriptions: [newOrdersToSlack, ordersToAccounting, rushOrders],
    })
    expect(admin.jobs.map((job) => job.name)).toEqual(['changes.dispatch', 'webhooks.deliver', 'webhooks.deliver-ordered'])
  })

  it('refuse to start without the function they call', async () => {
    const { ordersToAccounting } = await load()
    expect(() => createAdmin({ resources: [orders], db, authenticate: () => ({ user: { id: 1, roles: [] } }), subscriptions: [ordersToAccounting] })).toThrow(
      'Subscription "ordersToAccounting" calls the function "sync-order", which the app does not have',
    )
  })
})
