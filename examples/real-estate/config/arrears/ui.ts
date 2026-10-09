import { view } from '@protobase/schema'
import type { arrears } from './data'

export const arrearsView = view<typeof arrears>('arrears')
  .names({ singular: 'Arrears', plural: 'Arrears' })
  .help('Leases with rent outstanding: every charge minus its payments.')
  .fields((r) => ({
    leaseId: r.leaseId.label('Lease'),
    openCharges: r.openCharges.label('Open months').help('Charges not yet paid in full.'),
    balance: r.balance.label('Outstanding').prefix('€').decimals(2),
    oldestDueOn: r.oldestDueOn.label('Oldest due'),
  }))
  .list((r) => ({ columns: [r.leaseId, r.balance, r.openCharges, r.oldestDueOn], sort: [[r.balance, 'desc']] }))
  .filters((r, w) => [w.range(r.balance, { histogram: true }), w.range(r.openCharges)])
  .actions((a) => [a.action('remind', { label: 'Send reminder', icon: 'mail' })])
