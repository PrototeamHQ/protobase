import { f, resource } from '@protobase/schema'
import { access } from '../roles'

/** maintenance.inspections: at move-in, at move-out, and now and then in between. */
export const inspections = resource('inspections')
  .table('maintenance.inspections')
  .fields({
    id: f.bigint().readOnly().filterable().sortable().dbDefault(),
    organizationId: f.relation('organizations').filterable().sortable(),
    unitId: f.relation('units').filterable().sortable(),
    leaseId: f.relation('leases').optional().filterable().sortable(),
    inspectorId: f.relation('users').filterable().sortable(),
    kind: f.enum(['move_in', 'move_out', 'periodic']).filterable().sortable(),
    inspectedOn: f.date().filterable().sortable(),
    condition: f.enum(['good', 'fair', 'poor']).filterable().sortable(),
    notes: f.text().optional(),
    createdAt: f.timestamp().readOnly().dbDefault(),
    updatedAt: f.timestamp().readOnly().dbDefault(),
  })
  .primaryKey((r) => r.id)
  .tenant((r) => r.organizationId)
  .access(access('inspections'))
