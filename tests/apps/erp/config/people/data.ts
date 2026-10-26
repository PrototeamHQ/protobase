import { f, resource } from '@protobase/schema'
import { erpAccess } from '../roles'

/** crm.people */
export const people = resource('people')
  .table('crm.people')
  .fields({
    id: f.bigint().readOnly().filterable().sortable().dbDefault(),
    organization_id: f.relation('organizations').filterable().sortable(),
    company_id: f.relation('companies').filterable().sortable(),
    first_name: f.text(),
    last_name: f.text(),
    email: f.text().optional(),
    phone: f.text().optional(),
    job_title: f.text().optional(),
    created_at: f.timestamp().readOnly().filterable().sortable().dbDefault(),
    updated_at: f.timestamp().readOnly().dbDefault(),
  })
  .primaryKey((r) => r.id)
  .tenant((r) => r.organization_id)
  .access(erpAccess('people'))
