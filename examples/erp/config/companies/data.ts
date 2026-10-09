import { f, resource } from '@protobase/schema'
import { erpAccess } from '../roles'

/** crm.companies */
export const companies = resource('companies')
  .table('crm.companies')
  .fields({
    id: f.bigint().readOnly().filterable().sortable().dbDefault(),
    organizationId: f.relation('organizations').filterable().sortable(),
    name: f.text().filterable(),
    countryCode: f.relation('countries').filterable().sortable(),
    city: f.text(),
    vatNumber: f.text().optional(),
    email: f.text().optional(),
    phone: f.text().optional(),
    status: f.enum(['lead', 'active', 'dormant']).default('active').filterable().sortable(),
    createdAt: f.timestamp().readOnly().filterable().sortable().dbDefault(),
    updatedAt: f.timestamp().readOnly().dbDefault(),
  })
  .primaryKey((r) => r.id)
  .tenant((r) => r.organizationId)
  .search((r) => [r.name, r.city])
  .access(erpAccess('companies'))
