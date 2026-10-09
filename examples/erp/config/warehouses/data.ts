import { f, resource } from '@protobase/schema'
import { erpAccess } from '../roles'

/** inventory.warehouses. Unique: (organization_id, code) */
export const warehouses = resource('warehouses')
  .table('inventory.warehouses')
  .fields({
    id: f.integer().readOnly().filterable().sortable().dbDefault(),
    organizationId: f.relation('organizations').filterable().sortable(),
    code: f.text().filterable().sortable(),
    name: f.text(),
    city: f.text(),
    countryCode: f.relation('countries').filterable().sortable(),
    createdAt: f.timestamp().readOnly().dbDefault(),
    updatedAt: f.timestamp().readOnly().dbDefault(),
  })
  .primaryKey((r) => r.id)
  .tenant((r) => r.organizationId)
  .access(erpAccess('warehouses'))
