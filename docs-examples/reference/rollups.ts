import { f, resource } from '@protobase/schema'

// An order's total and line count kept from its lines, and each line's amount computed from its own fields.

/** shop.orders: one row per order. */
export const orders = resource('orders')
  .table('shop.orders')
  .fields({
    id: f.integer().readOnly().filterable().sortable().dbDefault(),
    customer: f.text(),
    // The sum of its lines' amounts; 0 for an order without lines.
    total: f.decimal({ precision: 12, scale: 2 }).rollup({ from: 'order_lines', via: 'order_id', fn: 'sum', field: 'amount' }).filterable().sortable(),
    line_count: f.integer().rollup({ from: 'order_lines', via: 'order_id', fn: 'count' }),
    // The largest line; empty for an order without lines.
    largest_line: f.decimal({ precision: 12, scale: 2 }).optional().rollup({ from: 'order_lines', via: 'order_id', fn: 'max', field: 'amount' }),
  })
  .primaryKey((r) => r.id)

/** shop.order_lines: what each order is for. */
export const orderLines = resource('order_lines')
  .table('shop.order_lines')
  .fields({
    id: f.integer().readOnly().filterable().dbDefault(),
    order_id: f.relation('orders').filterable(),
    quantity: f.integer().min(1),
    unit_price: f.decimal({ precision: 10, scale: 2 }),
    discount: f.decimal({ precision: 10, scale: 2 }).optional(),
    amount: f.decimal({ precision: 12, scale: 2 }).formula('round(quantity * unit_price - coalesce(discount, 0), 2)'),
  })
  .primaryKey((r) => r.id)
