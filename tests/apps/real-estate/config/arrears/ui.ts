import { view } from '@protobase/schema'
import type { arrears } from './data'

export const arrearsView = view<typeof arrears>('arrears')
  .names({ singular: 'Arrears', plural: 'Arrears' })
  .help('Leases with rent outstanding: every charge minus its payments.')
  .fields((r) => ({
    lease_id: r.lease_id.label('Lease'),
    open_charges: r.open_charges.label('Open months').help('Charges not yet paid in full.'),
    balance: r.balance.label('Outstanding').prefix('€').currency('EUR').decimals(2),
    oldest_due_on: r.oldest_due_on.label('Oldest due'),
  }))
  .list((r) => ({ columns: [r.lease_id, r.balance, r.open_charges, r.oldest_due_on], sort: [[r.balance, 'desc']] }))
  .filters((r, w) => [w.range(r.balance, { histogram: true }), w.range(r.open_charges)])
  .actions((a) => [
    a.action('remind', {
      label: 'Send reminder',
      icon: 'mail',
      inputs: (i) => [i.text('note', { label: 'Note', help: 'Added to the mail under what is outstanding.', multiline: true, optional: true })],
    }),
  ])
