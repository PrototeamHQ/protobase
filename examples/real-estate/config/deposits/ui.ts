import { l, view } from '@protobase/schema'
import type { deposits } from './data'

export const depositsView = view<typeof deposits>('deposits')
  .names({ singular: 'Deposit', plural: 'Deposits' })
  .fields((r) => ({
    leaseId: r.leaseId.label('Lease'),
    amount: r.amount.help('Usually two months of the first rent.').prefix('€').decimals(2),
    status: r.status.help('Held while the lease runs; settled after the move-out inspection.').format('badge').valueLabels({ held: 'Held', returned: 'Returned', partially_returned: 'Partially returned', withheld: 'Withheld' }),
    returnedAmount: r.returnedAmount.prefix('€').decimals(2),
  }))
  .list((r) => ({ columns: [r.leaseId, r.amount, r.status, r.receivedOn, r.returnedOn, r.returnedAmount] }))
  .filters((r, w) => [w.facets(r.status)])
  .layout((r) => [
    l.section('Deposit', [r.leaseId, r.amount, r.receivedOn]),
    l.section('Settlement', [r.status, r.returnedAmount, r.returnedOn], { help: 'Fill in after the move-out inspection.' }),
  ])
