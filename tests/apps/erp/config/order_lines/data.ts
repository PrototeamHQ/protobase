import { f, resource } from '@protobase/schema'
import { erpAccess } from '../roles'

/** sales.order_lines */
export const orderLines = resource('order_lines')
  .table('sales.order_lines')
  .fields({
    order_id: f.relation('orders').filterable().sortable(),
    line_no: f.integer().sortable(),
    organization_id: f.relation('organizations').filterable().sortable(),
    product_id: f.relation('products').filterable().sortable(),
    description: f.text(),
    quantity: f.integer(),
    unit_price: f.decimal({ precision: 12, scale: 2 }),
    created_at: f.timestamp().readOnly().dbDefault(),
    updated_at: f.timestamp().readOnly().dbDefault(),
  })
  .primaryKey((r) => [r.order_id, r.line_no])
  .tenant((r) => r.organization_id)
  .access(erpAccess('order_lines'))
