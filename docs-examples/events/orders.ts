import { f, resource } from '@protobase/schema'

// The events of a webshop's orders: every create, update and delete, and a few that mean something to the business.

/** sales.orders */
export const orders = resource('orders')
  .table('sales.orders')
  .fields({
    id: f.integer().readOnly().filterable().sortable(),
    number: f.text().readOnly(),
    status: f.enum(['open', 'paid', 'shipped', 'cancelled']).default('open'),
    total: f.decimal({ precision: 12, scale: 2 }),
    notes: f.text().optional(),
    iban: f.text().optional().sensitive(),
    deletedAt: f.timestamp().optional().readOnly(),
  })
  .primaryKey((r) => r.id)
  .softDelete((r) => r.deletedAt)
  .events((e, r) => [
    // orders.created, orders.updated, orders.deleted and, since it soft deletes, orders.undeleted
    ...e.crud(),
    // created with a total over 1000, or updated from 1000 or less to more
    e.becomes('large', 'total > 1000'),
    // the status changed, whatever it was and became
    e.updated('statusChanged', { changed: [r.status] }),
    // the refund account changed: a sensitive field, so `changed` is the only condition that can use it
    e.updated('refundAccountChanged', { changed: [r.iban] }),
    // a cancelled order that is no longer cancelled
    e.updated('reopened', { from: 'status = "cancelled"', when: 'status != "cancelled"' }),
    // a condition in code, for what a filter cannot say
    e.created('rush', { match: ({ after }) => String(after?.notes ?? '').includes('RUSH') }),
  ])
