import { f, resource } from '@protobase/schema'
import { erpAccess } from '../roles'

/** crm.companies */
export const companies = resource('companies')
  .table('crm.companies')
  .fields({
    id: f.bigint().readOnly().filterable().sortable().dbDefault(),
    organization_id: f.relation('organizations').filterable().sortable(),
    name: f.text().filterable(),
    country_code: f.relation('countries').filterable().sortable(),
    city: f.text(),
    vat_number: f.text().optional(),
    email: f.text().optional(),
    phone: f.text().optional(),
    status: f.enum(['lead', 'active', 'dormant']).default('active').filterable().sortable(),
    created_at: f.timestamp().readOnly().filterable().sortable().dbDefault(),
    updated_at: f.timestamp().readOnly().dbDefault(),
  })
  .primaryKey((r) => r.id)
  .tenant((r) => r.organization_id)
  .search((r) => [r.name, r.city])
  .access(erpAccess('companies'))
