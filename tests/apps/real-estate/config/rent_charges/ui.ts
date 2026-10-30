import { l, view } from '@protobase/schema'
import type { rentCharges } from './data'

export const rentChargesView = view<typeof rentCharges>('rent_charges')
  .title((r) => r.description)
  .names({ singular: 'Rent charge', plural: 'Rent charges' })
  .fields((r) => ({
    lease_id: r.lease_id.label('Lease'),
    period: r.period.help('The month the charge is for.'),
    due_on: r.due_on.label('Due'),
    amount: r.amount.help('Rent plus service costs for the month.').prefix('€').currency('EUR').decimals(2),
    paid_amount: r.paid_amount.label('Paid').help('The sum of the payments on this charge.').prefix('€').currency('EUR').decimals(2),
    outstanding: r.outstanding.help('What is still owed: the amount minus the payments.').prefix('€').currency('EUR').decimals(2),
  }))
  .list((r) => ({ columns: [r.description, r.lease_id, r.due_on, r.amount, r.paid_amount, r.outstanding], sort: [[r.period, 'desc']] }))
  .filters((r, w) => [w.dateRange(r.period, { presets: ['90d', 'quarter', 'year'] }), w.range(r.amount, { histogram: true })])
  .layout((r) => [
    l.section('Charge', [r.lease_id, r.period, r.due_on, r.description, r.amount]),
    l.related('Payments', {
      resource: 'payments',
      field: 'charge_id',
      sort: 'paid_on desc',
      columns: ['paid_on', 'amount', 'method', 'reference'],
      empty: 'No payments yet.',
    }),
    l.sidebar([r.amount, r.paid_amount, r.outstanding]),
  ])
