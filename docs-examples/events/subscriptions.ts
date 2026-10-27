import { subscription } from '@protobase/server'

// Where the events of docs-examples/events/orders.ts go: exported from config/index.ts, like the resource.

/** A Slack message per order, to an incoming webhook whose URL is in the environment; off without it. */
export const newOrdersToSlack = subscription('newOrdersToSlack', {
  events: ['orders.created'],
  url: process.env.SLACK_ORDERS_WEBHOOK,
  enabled: Boolean(process.env.SLACK_ORDERS_WEBHOOK),
  body: ({ data }) => ({ text: `New order ${data.after?.number}: €${data.after?.total}` }),
})

/**
 * Every change of an order to the app's own `sync-order` function, one at a time per order and in order, with only
 * what an accountant may read, signed so the function checks it as it would a call from outside.
 */
export const ordersToAccounting = subscription('ordersToAccounting', {
  events: ['orders.*'],
  function: 'sync-order',
  secret: process.env.ACCOUNTING_WEBHOOK_SECRET,
  as: { roles: ['accountant'] },
  ordered: true,
})

/** Code of the app's own, for each rush order; it throws to have the event tried again. */
export const rushOrders = subscription('rushOrders', {
  events: ['orders.rush'],
  run: async (event, { db }) => {
    await db.insertInto('sales.pick_lists').values({ order_id: Number(event.data.key), priority: 'rush' }).execute()
  },
})
