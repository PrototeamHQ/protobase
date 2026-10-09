import { f, resource } from '@protobase/schema'
import { access } from '../roles'

/** billing.rent_charges: one per lease and month. Unique: (lease_id, period). `paidAmount` follows the payments; `outstanding` is a generated column, amount minus paid. */
export const rentCharges = resource('rentCharges')
  .table('billing.rent_charges')
  .fields({
    id: f.bigint().readOnly().filterable().sortable().dbDefault(),
    organizationId: f.relation('organizations').filterable().sortable(),
    leaseId: f.relation('leases').filterable().sortable(),
    period: f.date().filterable().sortable(),
    dueOn: f.date().filterable().sortable(),
    description: f.text(),
    amount: f.decimal({ precision: 10, scale: 2 }).filterable().sortable(),
    paidAmount: f.decimal({ precision: 10, scale: 2 }).readOnly().default('0'),
    outstanding: f.decimal({ precision: 10, scale: 2 }).readOnly().filterable().sortable(),
    createdAt: f.timestamp().readOnly().dbDefault(),
    updatedAt: f.timestamp().readOnly().dbDefault(),
  })
  .primaryKey((r) => r.id)
  .tenant((r) => r.organizationId)
  .access(access('rentCharges'))
