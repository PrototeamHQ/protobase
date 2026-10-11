import { view } from '@protobase/schema'
import type { inspections } from './data'

export const inspectionsView = view<typeof inspections>('inspections')
  .names({ singular: 'Inspection', plural: 'Inspections' })
  .fields((r) => ({
    unit_id: r.unit_id.label('Unit'),
    lease_id: r.lease_id.label('Lease'),
    inspector_id: r.inspector_id.label('Inspector'),
    kind: r.kind.format('badge').valueLabels({ move_in: 'Move-in', move_out: 'Move-out', periodic: 'Periodic' }),
    inspected_on: r.inspected_on.label('Date'),
    condition: r.condition.format('badge').valueLabels({ good: 'Good', fair: 'Fair', poor: 'Poor' }),
  }))
  .list((r) => ({ columns: [r.unit_id, r.kind, r.inspected_on, r.condition, r.inspector_id], sort: [[r.inspected_on, 'desc']] }))
  .filters((r, w) => [w.facets(r.kind), w.facets(r.condition), w.dateRange(r.inspected_on, { presets: ['30d', '90d', 'year'] })])
