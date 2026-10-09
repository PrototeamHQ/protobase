import { view } from '@protobase/schema'
import type { payments } from './data'

export const paymentsView = view<typeof payments>('payments')
  .names({ singular: 'Payment', plural: 'Payments' })
  .fields((r) => ({
    chargeId: r.chargeId.label('Charge'),
    paidOn: r.paidOn.label('Paid on'),
    amount: r.amount.prefix('€').decimals(2),
    method: r.method.help('Direct debit is collected on the first; transfers and iDEAL come in when the tenant pays.').format('badge').valueLabels({ direct_debit: 'Direct debit', bank_transfer: 'Bank transfer', ideal: 'iDEAL' }),
  }))
  .list((r) => ({ columns: [r.chargeId, r.paidOn, r.amount, r.method, r.reference], sort: [[r.paidOn, 'desc']] }))
  .filters((r, w) => [w.facets(r.method), w.dateRange(r.paidOn, { presets: ['7d', '30d', '90d', 'year'] })])
  .chart((r) => ({ field: r.paidOn, range: '90d', granularity: 'week' }))
