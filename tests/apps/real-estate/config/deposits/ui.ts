import { l, view } from '@protobase/schema'
import type { deposits } from './data'

export const depositsView = view<typeof deposits>('deposits')
  .names({ singular: 'Deposit', plural: 'Deposits' })
  .fields((r) => ({
    lease_id: r.lease_id.label('Lease'),
    amount: r.amount.help('Usually two months of the first rent.').prefix('€').currency('EUR').decimals(2),
    status: r.status.help('Held while the lease runs; settled after the move-out inspection.').format('badge').valueLabels({ held: 'Held', returned: 'Returned', partially_returned: 'Partially returned', withheld: 'Withheld' }),
    returned_amount: r.returned_amount.prefix('€').currency('EUR').decimals(2),
  }))
  .list((r) => ({ columns: [r.lease_id, r.amount, r.status, r.received_on, r.returned_on, r.returned_amount] }))
  .filters((r, w) => [w.facets(r.status)])
  .layout((r) => [
    l.section('Deposit', [r.lease_id, r.amount, r.received_on]),
    l.section('Settlement', [r.status, r.returned_amount, r.returned_on], { help: 'Fill in after the move-out inspection.' }),
  ])
