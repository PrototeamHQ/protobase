import { f, resource } from '@protobase/schema'
import { access } from '../roles'

/** billing.rent_charges: one per lease and month. Unique: (lease_id, period). `paid_amount` follows the payments; `outstanding` is a generated column, amount minus paid. */
export const rentCharges = resource('rent_charges')
  .table('billing.rent_charges')
  .fields({
    id: f.bigint().readOnly().filterable().sortable().dbDefault(),
    organization_id: f.relation('organizations').filterable().sortable(),
    lease_id: f.relation('leases').filterable().sortable(),
    period: f.date().filterable().sortable(),
    due_on: f.date().filterable().sortable(),
    description: f.text(),
    amount: f.decimal({ precision: 10, scale: 2 }).filterable().sortable(),
    paid_amount: f.decimal({ precision: 10, scale: 2 }).readOnly().default('0'),
    outstanding: f.decimal({ precision: 10, scale: 2 }).readOnly().filterable().sortable(),
    created_at: f.timestamp().readOnly().dbDefault(),
    updated_at: f.timestamp().readOnly().dbDefault(),
  })
  .primaryKey((r) => r.id)
  .tenant((r) => r.organization_id)
  .access(access('rent_charges'))
