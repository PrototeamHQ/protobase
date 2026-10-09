import { f, resource } from '@protobase/schema'
import { erpAccess } from '../roles'

/** sales.order_lines */
export const orderLines = resource('orderLines')
  .table('sales.order_lines')
  .fields({
    orderId: f.relation('orders').filterable().sortable(),
    lineNo: f.integer().sortable(),
    organizationId: f.relation('organizations').filterable().sortable(),
    productId: f.relation('products').filterable().sortable(),
    description: f.text(),
    quantity: f.integer(),
    unitPrice: f.decimal({ precision: 12, scale: 2 }),
    createdAt: f.timestamp().readOnly().dbDefault(),
    updatedAt: f.timestamp().readOnly().dbDefault(),
  })
  .primaryKey((r) => [r.orderId, r.lineNo])
  .tenant((r) => r.organizationId)
  .access(erpAccess('orderLines'))
