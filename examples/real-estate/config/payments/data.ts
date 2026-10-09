import { f, resource } from '@protobase/schema'
import { access } from '../roles'

/** billing.payments. Postgres refuses payments that add up to more than their charge. */
export const payments = resource('payments')
  .table('billing.payments')
  .fields({
    id: f.bigint().readOnly().filterable().sortable().dbDefault(),
    organizationId: f.relation('organizations').filterable().sortable(),
    chargeId: f.relation('rentCharges').filterable().sortable(),
    paidOn: f.date().filterable().sortable(),
    amount: f.decimal({ precision: 10, scale: 2 }),
    method: f.enum(['direct_debit', 'bank_transfer', 'ideal']).filterable().sortable(),
    reference: f.text().optional(),
    createdAt: f.timestamp().readOnly().dbDefault(),
    updatedAt: f.timestamp().readOnly().dbDefault(),
  })
  .primaryKey((r) => r.id)
  .tenant((r) => r.organizationId)
  .access(access('payments'))
