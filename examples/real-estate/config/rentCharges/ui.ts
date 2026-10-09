import { l, view } from '@protobase/schema'
import type { rentCharges } from './data'

export const rentChargesView = view<typeof rentCharges>('rentCharges')
  .title((r) => r.description)
  .names({ singular: 'Rent charge', plural: 'Rent charges' })
  .fields((r) => ({
    leaseId: r.leaseId.label('Lease'),
    period: r.period.help('The month the charge is for.'),
    dueOn: r.dueOn.label('Due'),
    amount: r.amount.help('Rent plus service costs for the month.').prefix('€').decimals(2),
    paidAmount: r.paidAmount.label('Paid').help('The sum of the payments on this charge.').prefix('€').decimals(2),
    outstanding: r.outstanding.help('What is still owed: the amount minus the payments.').prefix('€').decimals(2),
  }))
  .list((r) => ({ columns: [r.description, r.leaseId, r.dueOn, r.amount, r.paidAmount, r.outstanding], sort: [[r.period, 'desc']] }))
  .filters((r, w) => [w.dateRange(r.period, { presets: ['90d', 'quarter', 'year'] }), w.range(r.amount, { histogram: true })])
  .layout((r) => [
    l.section('Charge', [r.leaseId, r.period, r.dueOn, r.description, r.amount]),
    l.related('Payments', {
      resource: 'payments',
      field: 'chargeId',
      sort: 'paidOn desc',
      columns: ['paidOn', 'amount', 'method', 'reference'],
      empty: 'No payments yet.',
    }),
    l.sidebar([r.amount, r.paidAmount, r.outstanding]),
  ])
