import { f, resource } from '@protobase/schema'
import { erpAccess } from '../roles'

/** crm.tags. Unique: (organization_id, name) */
export const tags = resource('tags')
  .table('crm.tags')
  .fields({
    id: f.integer().readOnly().filterable().sortable().dbDefault(),
    organization_id: f.relation('organizations').filterable().sortable(),
    name: f.text().filterable().sortable(),
    color: f.text(),
    created_at: f.timestamp().readOnly().dbDefault(),
    updated_at: f.timestamp().readOnly().dbDefault(),
  })
  .primaryKey((r) => r.id)
  .tenant((r) => r.organization_id)
  .access(erpAccess('tags'))
