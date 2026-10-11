import { f, resource } from '@protobase/schema'
import { erpAccess, roles } from '../roles'

/** inventory.stock_moves */
export const stockMoves = resource('stock_moves')
  .table('inventory.stock_moves')
  .fields({
    id: f.bigint().readOnly().filterable().sortable().dbDefault(),
    organization_id: f.relation('organizations').filterable().sortable(),
    product_id: f.relation('products').filterable().sortable(),
    warehouse_id: f.relation('warehouses').filterable().sortable(),
    location_id: f.relation('locations').filterable().sortable(),
    kind: f.enum(['receipt', 'issue', 'transfer', 'adjustment']).filterable().sortable(),
    quantity: f.integer().filterable().sortable(),
    unit_cost: f.decimal({ precision: 12, scale: 2 }).access({ read: roles.can('costs.read') }),
    reference: f.text().optional(),
    moved_at: f.timestamp().filterable().sortable(),
    user_id: f.relation('users').optional().filterable().sortable(),
  })
  .primaryKey((r) => r.id)
  .tenant((r) => r.organization_id)
  .access(erpAccess('stock_moves'))
