import { f, resource } from '@protobase/schema'
import { erpAccess } from '../roles'

/** inventory.locations. Unique: (warehouse_id, path) */
export const locations = resource('locations')
  .table('inventory.locations')
  .fields({
    id: f.integer().readOnly().filterable().sortable().dbDefault(),
    organizationId: f.relation('organizations').filterable().sortable(),
    warehouseId: f.relation('warehouses').filterable().sortable(),
    path: f.text().readOnly().filterable(),
    name: f.text(),
    createdAt: f.timestamp().readOnly().dbDefault(),
    updatedAt: f.timestamp().readOnly().dbDefault(),
  })
  .primaryKey((r) => r.id)
  .tenant((r) => r.organizationId)
  .access(erpAccess('locations'))
