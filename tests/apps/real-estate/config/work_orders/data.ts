import { f, resource } from '@protobase/schema'
import { access } from '../roles'

/** maintenance.work_orders: a vendor's visit for a ticket. */
export const workOrders = resource('work_orders')
  .table('maintenance.work_orders')
  .fields({
    id: f.bigint().readOnly().filterable().sortable().dbDefault(),
    organization_id: f.relation('organizations').filterable().sortable(),
    ticket_id: f.relation('tickets').filterable().sortable(),
    vendor_id: f.relation('vendors').filterable().sortable(),
    scheduled_for: f.date().filterable().sortable(),
    completed_on: f.date().optional(),
    hours: f.decimal({ precision: 5, scale: 2 }).optional(),
    cost: f.decimal({ precision: 10, scale: 2 }).optional(),
    notes: f.text().optional(),
    created_at: f.timestamp().readOnly().dbDefault(),
    updated_at: f.timestamp().readOnly().dbDefault(),
  })
  .primaryKey((r) => r.id)
  .tenant((r) => r.organization_id)
  .access(access('work_orders'))
