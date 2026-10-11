import { f, resource } from '@protobase/schema'
import { access } from '../roles'

/** maintenance.inspections: at move-in, at move-out, and now and then in between. */
export const inspections = resource('inspections')
  .table('maintenance.inspections')
  .fields({
    id: f.bigint().readOnly().filterable().sortable().dbDefault(),
    organization_id: f.relation('organizations').filterable().sortable(),
    unit_id: f.relation('units').filterable().sortable(),
    lease_id: f.relation('leases').optional().filterable().sortable(),
    inspector_id: f.relation('users').filterable().sortable(),
    kind: f.enum(['move_in', 'move_out', 'periodic']).filterable().sortable(),
    inspected_on: f.date().filterable().sortable(),
    condition: f.enum(['good', 'fair', 'poor']).filterable().sortable(),
    notes: f.text().optional(),
    created_at: f.timestamp().readOnly().dbDefault(),
    updated_at: f.timestamp().readOnly().dbDefault(),
  })
  .primaryKey((r) => r.id)
  .tenant((r) => r.organization_id)
  .access(access('inspections'))
