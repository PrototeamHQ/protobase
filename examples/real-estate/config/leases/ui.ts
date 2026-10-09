import { l, view } from '@protobase/schema'
import type { leases } from './data'

export const leasesView = view<typeof leases>('leases')
  .title((r) => r.number)
  .names({ singular: 'Lease', plural: 'Leases' })
  .fields((r) => ({
    number: r.number.help('Assigned when the lease is signed.').format('code'),
    unitId: r.unitId.label('Unit'),
    term: r.term.help('Indefinite leases run until notice; fixed ones end on their end date.').format('badge').valueLabels({ indefinite: 'Indefinite', fixed: 'Fixed' }),
    startDate: r.startDate.label('Start'),
    endDate: r.endDate.label('End').help('The last day of the tenancy. Empty while an indefinite lease runs.'),
    monthlyRent: r.monthlyRent.help('Current rent; it rises every 1 July.').prefix('€').decimals(2),
    serviceCosts: r.serviceCosts.help('Monthly advance for shared services, billed with the rent.').prefix('€').decimals(2),
    noticeGivenOn: r.noticeGivenOn.label('Notice given'),
  }))
  .list((r) => ({ columns: [r.number, r.unitId, r.term, r.startDate, r.endDate, r.monthlyRent], sort: [[r.startDate, 'desc']], search: [r.number] }))
  .filters((r, w) => [w.facets(r.term), w.dateRange(r.startDate, { presets: ['90d', 'year'] }), w.dateRange(r.endDate, { presets: ['90d', 'year'] })])
  .layout((r) => [
    l.section('Lease', [r.unitId, r.term, r.startDate, r.endDate, r.noticeGivenOn]),
    l.section('Rent', [r.monthlyRent, r.serviceCosts]),
    l.related('Rent charges', {
      resource: 'rentCharges',
      field: 'leaseId',
      sort: 'period desc',
      columns: ['period', 'dueOn', 'description', 'amount', 'paidAmount', 'outstanding'],
      // a year of monthly charges per page
      pageSize: 12,
      empty: 'No rent charged yet.',
    }),
    l.sidebar([r.term, r.monthlyRent]),
  ])
  .saveFeedback('button')
