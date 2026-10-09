import { l, view } from '@protobase/schema'
import type { units } from './data'

/** A lease that covers today; `end_date` is its last day. */
const running = 'startDate <= now() AND (isNull(endDate) OR endDate >= now())'

export const unitsView = view<typeof units>('units')
  .title((r) => r.label)
  .names({ singular: 'Unit', plural: 'Units' })
  .nav({ recent: { status: 'status', tones: { vacant: 'warning', renovation: 'info' }, filter: 'status != "let"' } })
  .fields((r) => ({
    propertyId: r.propertyId.label('Property'),
    areaM2: r.areaM2.label('Area').help('Living area in m².').prefix('m² '),
    energyLabel: r.energyLabel.format('badge'),
    baseRent: r.baseRent.label('Market rent').help('What a new lease would ask today, per month.').prefix('€').decimals(2),
    status: r.status.help('Let while a lease runs; vacant or under renovation between leases.').format('badge').valueLabels({ let: 'Let', vacant: 'Vacant', renovation: 'Renovation' }),
  }))
  .list((r) => ({ columns: [r.label, r.propertyId, r.status, r.bedrooms, r.areaM2, r.energyLabel, r.baseRent], search: [r.label] }))
  .filters((r, w) => [w.facets(r.status), w.facets(r.energyLabel), w.range(r.baseRent, { histogram: true })])
  .layout((r) => [
    l.section('Unit', [r.propertyId, r.label, r.floor, r.bedrooms, r.areaM2, r.energyLabel]),
    l.section('Letting', [r.status, r.baseRent]),
    l.related('Let to', {
      resource: 'leaseTenants',
      field: 'leaseId',
      through: { resource: 'leases', field: 'unitId', filter: running },
      // `primary` sorts after `co_signer`, so the primary tenant comes first
      sort: 'role desc',
      columns: ['tenantId', 'role', 'tenantId.email', 'tenantId.phone'],
      help: 'The primary tenant and co-signers of the running lease.',
      empty: 'Vacant: no lease runs today.',
    }),
    l.related('Running lease', {
      resource: 'leases',
      field: 'unitId',
      filter: running,
      columns: ['number', 'term', 'startDate', 'endDate', 'monthlyRent', 'serviceCosts'],
      empty: 'Vacant: no lease runs today.',
    }),
    l.sidebar([r.status, r.baseRent]),
  ])
