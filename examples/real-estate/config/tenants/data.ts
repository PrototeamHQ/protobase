import { f, resource } from '@protobase/schema'
import { access, roles } from '../roles'

/** leasing.tenants. Income and IBAN are screening data: only roles holding `screening.read` see them, and the IBAN only when revealed. */
export const tenants = resource('tenants')
  .table('leasing.tenants')
  .fields({
    id: f.bigint().readOnly().filterable().sortable().dbDefault(),
    organizationId: f.relation('organizations').filterable().sortable(),
    firstName: f.text(),
    lastName: f.text().filterable().sortable(),
    email: f.text(),
    phone: f.text().optional(),
    dateOfBirth: f.date(),
    iban: f.text().sensitive().access({ read: roles.can('screening.read') }),
    monthlyIncome: f.decimal({ precision: 10, scale: 2 }).access({ read: roles.can('screening.read') }),
    createdAt: f.timestamp().readOnly().filterable().sortable().dbDefault(),
    updatedAt: f.timestamp().readOnly().dbDefault(),
  })
  .primaryKey((r) => r.id)
  .tenant((r) => r.organizationId)
  .search((r) => [r.firstName, r.lastName, r.email, r.phone.digitsEnd()])
  .access(access('tenants'))
