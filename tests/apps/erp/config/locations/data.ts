import { f, resource } from '@protobase/schema'
import { erpAccess } from '../roles'

/** inventory.locations. Unique: (warehouse_id, path) */
export const locations = resource('locations')
  .table('inventory.locations')
  .fields({
    id: f.integer().readOnly().filterable().sortable().dbDefault(),
    organization_id: f.relation('organizations').filterable().sortable(),
    warehouse_id: f.relation('warehouses').filterable().sortable(),
    path: f.text().readOnly().filterable(),
    name: f.text(),
    created_at: f.timestamp().readOnly().dbDefault(),
    updated_at: f.timestamp().readOnly().dbDefault(),
  })
  .primaryKey((r) => r.id)
  .tenant((r) => r.organization_id)
  .access(erpAccess('locations'))
