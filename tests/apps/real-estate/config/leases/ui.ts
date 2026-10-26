import { l, view } from '@protobase/schema'
import type { leases } from './data'

export const leasesView = view<typeof leases>('leases')
  .title((r) => r.number)
  .names({ singular: 'Lease', plural: 'Leases' })
  .fields((r) => ({
    number: r.number.help('Assigned when the lease is signed.').format('code'),
    unit_id: r.unit_id.label('Unit'),
    term: r.term.help('Indefinite leases run until notice; fixed ones end on their end date.').format('badge').valueLabels({ indefinite: 'Indefinite', fixed: 'Fixed' }),
    start_date: r.start_date.label('Start'),
    end_date: r.end_date.label('End').help('The last day of the tenancy. Empty while an indefinite lease runs.'),
    monthly_rent: r.monthly_rent.help('Current rent; it rises every 1 July.').prefix('€').decimals(2),
    service_costs: r.service_costs.help('Monthly advance for shared services, billed with the rent.').prefix('€').decimals(2),
    notice_given_on: r.notice_given_on.label('Notice given'),
  }))
  .list((r) => ({ columns: [r.number, r.unit_id, r.term, r.start_date, r.end_date, r.monthly_rent], sort: [[r.start_date, 'desc']], search: [r.number] }))
  .filters((r, w) => [w.facets(r.term), w.dateRange(r.start_date, { presets: ['90d', 'year'] }), w.dateRange(r.end_date, { presets: ['90d', 'year'] })])
  .layout((r) => [
    l.section('Lease', [r.unit_id, r.term, r.start_date, r.end_date, r.notice_given_on]),
    l.section('Rent', [r.monthly_rent, r.service_costs]),
    l.related('Rent charges', {
      resource: 'rent_charges',
      field: 'lease_id',
      sort: 'period desc',
      columns: ['period', 'due_on', 'description', 'amount', 'paid_amount', 'outstanding'],
      // a year of monthly charges
      limit: 12,
      empty: 'No rent charged yet.',
    }),
    l.sidebar([r.term, r.monthly_rent]),
  ])
  .saveFeedback('button')
