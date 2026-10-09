import { f, resource } from '@protobase/schema'
import { erpAccess } from '../roles'

/** crm.people */
export const people = resource('people')
  .table('crm.people')
  .fields({
    id: f.bigint().readOnly().filterable().sortable().dbDefault(),
    organizationId: f.relation('organizations').filterable().sortable(),
    companyId: f.relation('companies').filterable().sortable(),
    firstName: f.text(),
    lastName: f.text(),
    email: f.text().optional(),
    phone: f.text().optional(),
    jobTitle: f.text().optional(),
    createdAt: f.timestamp().readOnly().filterable().sortable().dbDefault(),
    updatedAt: f.timestamp().readOnly().dbDefault(),
  })
  .primaryKey((r) => r.id)
  .tenant((r) => r.organizationId)
  .access(erpAccess('people'))
