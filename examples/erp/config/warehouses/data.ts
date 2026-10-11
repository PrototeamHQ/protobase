import { f, resource } from '@protobase/schema'
import { erpAccess } from '../roles'

/** inventory.warehouses. Unique: (organization_id, code) */
export const warehouses = resource('warehouses')
  .table('inventory.warehouses')
  .fields({
    id: f.integer().readOnly().filterable().sortable().dbDefault(),
    organization_id: f.relation('organizations').filterable().sortable(),
    code: f.text().filterable().sortable(),
    name: f.text(),
    city: f.text(),
    country_code: f.relation('countries').filterable().sortable(),
    created_at: f.timestamp().readOnly().dbDefault(),
    updated_at: f.timestamp().readOnly().dbDefault(),
  })
  .primaryKey((r) => r.id)
  .tenant((r) => r.organization_id)
  .access(erpAccess('warehouses'))
