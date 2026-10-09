import { f, resource } from '@protobase/schema'
import { erpAccess } from '../roles'

/** inventory.stock_levels */
export const stockLevels = resource('stockLevels')
  .table('inventory.stock_levels')
  .fields({
    productId: f.relation('products').filterable().sortable(),
    locationId: f.relation('locations').filterable().sortable(),
    organizationId: f.relation('organizations').filterable().sortable(),
    quantity: f.integer(),
    updatedAt: f.timestamp().readOnly().dbDefault(),
  })
  .primaryKey((r) => [r.productId, r.locationId])
  .tenant((r) => r.organizationId)
  .access(erpAccess('stockLevels'))
