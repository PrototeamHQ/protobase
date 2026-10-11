import { f, resource } from '@protobase/schema'
import { access } from '../roles'

/** leasing.deposits: one per lease. */
export const deposits = resource('deposits')
  .table('leasing.deposits')
  .fields({
    id: f.bigint().readOnly().filterable().sortable().dbDefault(),
    organization_id: f.relation('organizations').filterable().sortable(),
    lease_id: f.relation('leases').filterable().sortable(),
    amount: f.decimal({ precision: 10, scale: 2 }),
    received_on: f.date(),
    status: f.enum(['held', 'returned', 'partially_returned', 'withheld']).default('held').filterable().sortable(),
    returned_amount: f.decimal({ precision: 10, scale: 2 }).default('0'),
    returned_on: f.date().optional(),
    created_at: f.timestamp().readOnly().filterable().sortable().dbDefault(),
    updated_at: f.timestamp().readOnly().dbDefault(),
  })
  .primaryKey((r) => r.id)
  .tenant((r) => r.organization_id)
  .access(access('deposits'))
