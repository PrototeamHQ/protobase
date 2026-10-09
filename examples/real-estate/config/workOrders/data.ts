import { f, resource } from '@protobase/schema'
import { access } from '../roles'

/** maintenance.work_orders: a vendor's visit for a ticket. */
export const workOrders = resource('workOrders')
  .table('maintenance.work_orders')
  .fields({
    id: f.bigint().readOnly().filterable().sortable().dbDefault(),
    organizationId: f.relation('organizations').filterable().sortable(),
    ticketId: f.relation('tickets').filterable().sortable(),
    vendorId: f.relation('vendors').filterable().sortable(),
    scheduledFor: f.date().filterable().sortable(),
    completedOn: f.date().optional(),
    hours: f.decimal({ precision: 5, scale: 2 }).optional(),
    cost: f.decimal({ precision: 10, scale: 2 }).optional(),
    notes: f.text().optional(),
    createdAt: f.timestamp().readOnly().dbDefault(),
    updatedAt: f.timestamp().readOnly().dbDefault(),
  })
  .primaryKey((r) => r.id)
  .tenant((r) => r.organizationId)
  .access(access('workOrders'))
