import { f, resource } from '@protobase/schema'
import { erpAccess } from '../roles'

/** inventory.stock_levels */
export const stockLevels = resource('stock_levels')
  .table('inventory.stock_levels')
  .fields({
    product_id: f.relation('products').filterable().sortable(),
    location_id: f.relation('locations').filterable().sortable(),
    organization_id: f.relation('organizations').filterable().sortable(),
    quantity: f.integer(),
    updated_at: f.timestamp().readOnly().dbDefault(),
  })
  .primaryKey((r) => [r.product_id, r.location_id])
  .tenant((r) => r.organization_id)
  .access(erpAccess('stock_levels'))
