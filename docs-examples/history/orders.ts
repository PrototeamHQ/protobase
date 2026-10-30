import { f, l, resource, view } from '@protobase/schema'

// A webshop's orders, each change kept with who made it: History on the order page, and Activity for admins.

/** sales.orders */
export const orders = resource('orders')
  .table('sales.orders')
  .fields({
    id: f.integer().readOnly().filterable().sortable(),
    number: f.text().readOnly(),
    status: f.enum(['open', 'paid', 'shipped', 'cancelled']).default('open'),
    total: f.decimal({ precision: 12, scale: 2 }),
    iban: f.text().optional().sensitive(),
  })
  .primaryKey((r) => r.id)
  .history()

export const ordersView = view<typeof orders>('orders')
  .title((r) => r.number)
  .fields((r) => ({ number: r.number.format('code'), status: r.status.valueColors({ paid: 'green', shipped: 'violet', cancelled: 'red' }) }))
  .layout((r) => [
    l.section('Order', [r.number, r.status, r.total, r.iban]),
    // the last 10 changes, newest first, with Show more for the rest
    l.history(),
  ])
