import { f, resource } from '@protobase/schema'
import { erpAccess } from '../roles'

/** crm.tags. Unique: (organization_id, name) */
export const tags = resource('tags')
  .table('crm.tags')
  .fields({
    id: f.integer().readOnly().filterable().sortable().dbDefault(),
    organizationId: f.relation('organizations').filterable().sortable(),
    name: f.text().filterable().sortable(),
    color: f.text(),
    createdAt: f.timestamp().readOnly().dbDefault(),
    updatedAt: f.timestamp().readOnly().dbDefault(),
  })
  .primaryKey((r) => r.id)
  .tenant((r) => r.organizationId)
  .access(erpAccess('tags'))
