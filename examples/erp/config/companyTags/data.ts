import { f, resource } from '@protobase/schema'
import { erpAccess } from '../roles'

/** crm.company_tags */
export const companyTags = resource('companyTags')
  .table('crm.company_tags')
  .fields({
    companyId: f.relation('companies').filterable().sortable(),
    tagId: f.relation('tags').filterable().sortable(),
    organizationId: f.relation('organizations').filterable().sortable(),
    addedBy: f.relation('users').optional().filterable().sortable(),
    addedAt: f.timestamp().dbDefault(),
  })
  .primaryKey((r) => [r.companyId, r.tagId])
  .tenant((r) => r.organizationId)
  .access(erpAccess('companyTags'))
