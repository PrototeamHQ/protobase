import { l, view } from '@protobase/schema'
import type { units } from './data'

/** A lease that covers today; `end_date` is its last day. */
const running = 'start_date <= now() AND (isNull(end_date) OR end_date >= now())'

export const unitsView = view<typeof units>('units')
  .title((r) => r.label)
  .names({ singular: 'Unit', plural: 'Units' })
  .nav({ recent: { status: 'status', tones: { vacant: 'warning', renovation: 'info' }, filter: 'status != "let"' } })
  .fields((r) => ({
    property_id: r.property_id.label('Property'),
    area_m2: r.area_m2.label('Area').help('Living area in m².').prefix('m² '),
    energy_label: r.energy_label.format('badge'),
    base_rent: r.base_rent.label('Market rent').help('What a new lease would ask today, per month.').prefix('€').decimals(2),
    status: r.status.help('Let while a lease runs; vacant or under renovation between leases.').format('badge').valueLabels({ let: 'Let', vacant: 'Vacant', renovation: 'Renovation' }),
  }))
  .list((r) => ({ columns: [r.label, r.property_id, r.status, r.bedrooms, r.area_m2, r.energy_label, r.base_rent], search: [r.label] }))
  .filters((r, w) => [w.facets(r.status), w.facets(r.energy_label), w.range(r.base_rent, { histogram: true })])
  .layout((r) => [
    l.section('Unit', [r.property_id, r.label, r.floor, r.bedrooms, r.area_m2, r.energy_label]),
    l.section('Letting', [r.status, r.base_rent]),
    l.related('Let to', {
      resource: 'lease_tenants',
      field: 'lease_id',
      through: { resource: 'leases', field: 'unit_id', filter: running },
      // `primary` sorts after `co_signer`, so the primary tenant comes first
      sort: 'role desc',
      columns: ['tenant_id', 'role', 'tenant_id.email', 'tenant_id.phone'],
      help: 'The primary tenant and co-signers of the running lease.',
      empty: 'Vacant: no lease runs today.',
    }),
    l.related('Running lease', {
      resource: 'leases',
      field: 'unit_id',
      filter: running,
      columns: ['number', 'term', 'start_date', 'end_date', 'monthly_rent', 'service_costs'],
      empty: 'Vacant: no lease runs today.',
    }),
    l.sidebar([r.status, r.base_rent]),
  ])
