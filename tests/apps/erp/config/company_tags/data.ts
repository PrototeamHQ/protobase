import { f, resource } from '@protobase/schema'
import { erpAccess } from '../roles'

/** crm.company_tags */
export const companyTags = resource('company_tags')
  .table('crm.company_tags')
  .fields({
    company_id: f.relation('companies').filterable().sortable(),
    tag_id: f.relation('tags').filterable().sortable(),
    organization_id: f.relation('organizations').filterable().sortable(),
    added_by: f.relation('users').optional().filterable().sortable(),
    added_at: f.timestamp().dbDefault(),
  })
  .primaryKey((r) => [r.company_id, r.tag_id])
  .tenant((r) => r.organization_id)
  .access(erpAccess('company_tags'))
