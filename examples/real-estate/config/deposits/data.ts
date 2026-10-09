import { f, resource } from '@protobase/schema'
import { access } from '../roles'

/** leasing.deposits: one per lease. */
export const deposits = resource('deposits')
  .table('leasing.deposits')
  .fields({
    id: f.bigint().readOnly().filterable().sortable().dbDefault(),
    organizationId: f.relation('organizations').filterable().sortable(),
    leaseId: f.relation('leases').filterable().sortable(),
    amount: f.decimal({ precision: 10, scale: 2 }),
    receivedOn: f.date(),
    status: f.enum(['held', 'returned', 'partially_returned', 'withheld']).default('held').filterable().sortable(),
    returnedAmount: f.decimal({ precision: 10, scale: 2 }).default('0'),
    returnedOn: f.date().optional(),
    createdAt: f.timestamp().readOnly().filterable().sortable().dbDefault(),
    updatedAt: f.timestamp().readOnly().dbDefault(),
  })
  .primaryKey((r) => r.id)
  .tenant((r) => r.organizationId)
  .access(access('deposits'))
