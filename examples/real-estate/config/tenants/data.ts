import { f, resource } from '@protobase/schema'
import { access, roles } from '../roles'

/** leasing.tenants. Income and IBAN are screening data: only roles holding `screening.read` see them, and the IBAN only when revealed. */
export const tenants = resource('tenants')
  .table('leasing.tenants')
  .fields({
    id: f.bigint().readOnly().filterable().sortable().dbDefault(),
    organization_id: f.relation('organizations').filterable().sortable(),
    first_name: f.text(),
    last_name: f.text().filterable().sortable(),
    email: f.text(),
    phone: f.text().optional(),
    date_of_birth: f.date(),
    iban: f.text().sensitive().access({ read: roles.can('screening.read') }),
    monthly_income: f.decimal({ precision: 10, scale: 2 }).access({ read: roles.can('screening.read') }),
    created_at: f.timestamp().readOnly().filterable().sortable().dbDefault(),
    updated_at: f.timestamp().readOnly().dbDefault(),
  })
  .primaryKey((r) => r.id)
  .tenant((r) => r.organization_id)
  .search((r) => [r.first_name, r.last_name, r.email, r.phone.digitsEnd()])
  .access(access('tenants'))
