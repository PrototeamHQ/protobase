import { f, resource } from '@protobase/schema'
import { erpAccess, roles } from '../roles'

/** inventory.stock_moves */
export const stockMoves = resource('stockMoves')
  .table('inventory.stock_moves')
  .fields({
    id: f.bigint().readOnly().filterable().sortable().dbDefault(),
    organizationId: f.relation('organizations').filterable().sortable(),
    productId: f.relation('products').filterable().sortable(),
    warehouseId: f.relation('warehouses').filterable().sortable(),
    locationId: f.relation('locations').filterable().sortable(),
    kind: f.enum(['receipt', 'issue', 'transfer', 'adjustment']).filterable().sortable(),
    quantity: f.integer().filterable().sortable(),
    unitCost: f.decimal({ precision: 12, scale: 2 }).access({ read: roles.can('costs.read') }),
    reference: f.text().optional(),
    movedAt: f.timestamp().filterable().sortable(),
    userId: f.relation('users').optional().filterable().sortable(),
  })
  .primaryKey((r) => r.id)
  .tenant((r) => r.organizationId)
  .access(erpAccess('stockMoves'))
