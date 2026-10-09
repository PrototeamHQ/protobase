import { view } from '@protobase/schema'
import type { inspections } from './data'

export const inspectionsView = view<typeof inspections>('inspections')
  .names({ singular: 'Inspection', plural: 'Inspections' })
  .fields((r) => ({
    unitId: r.unitId.label('Unit'),
    leaseId: r.leaseId.label('Lease'),
    inspectorId: r.inspectorId.label('Inspector'),
    kind: r.kind.format('badge').valueLabels({ move_in: 'Move-in', move_out: 'Move-out', periodic: 'Periodic' }),
    inspectedOn: r.inspectedOn.label('Date'),
    condition: r.condition.format('badge').valueLabels({ good: 'Good', fair: 'Fair', poor: 'Poor' }),
  }))
  .list((r) => ({ columns: [r.unitId, r.kind, r.inspectedOn, r.condition, r.inspectorId], sort: [[r.inspectedOn, 'desc']] }))
  .filters((r, w) => [w.facets(r.kind), w.facets(r.condition), w.dateRange(r.inspectedOn, { presets: ['30d', '90d', 'year'] })])
