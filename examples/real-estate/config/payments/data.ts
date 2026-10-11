import { f, resource } from '@protobase/schema'
import { access } from '../roles'

/** billing.payments. Postgres refuses payments that add up to more than their charge. */
export const payments = resource('payments')
  .table('billing.payments')
  .fields({
    id: f.bigint().readOnly().filterable().sortable().dbDefault(),
    organization_id: f.relation('organizations').filterable().sortable(),
    charge_id: f.relation('rent_charges').filterable().sortable(),
    paid_on: f.date().filterable().sortable(),
    amount: f.decimal({ precision: 10, scale: 2 }),
    method: f.enum(['direct_debit', 'bank_transfer', 'ideal']).filterable().sortable(),
    reference: f.text().optional(),
    created_at: f.timestamp().readOnly().dbDefault(),
    updated_at: f.timestamp().readOnly().dbDefault(),
  })
  .primaryKey((r) => r.id)
  .tenant((r) => r.organization_id)
  .access(access('payments'))
