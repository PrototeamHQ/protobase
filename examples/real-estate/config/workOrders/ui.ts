import { l, view } from '@protobase/schema'
import type { workOrders } from './data'

export const workOrdersView = view<typeof workOrders>('workOrders')
  .names({ singular: 'Work order', plural: 'Work orders' })
  .fields((r) => ({
    ticketId: r.ticketId.label('Ticket'),
    vendorId: r.vendorId.label('Vendor'),
    scheduledFor: r.scheduledFor.label('Visit'),
    completedOn: r.completedOn.label('Completed'),
    cost: r.cost.help('Labour and materials, as invoiced by the vendor.').prefix('€').decimals(2),
  }))
  .list((r) => ({ columns: [r.ticketId, r.vendorId, r.scheduledFor, r.completedOn, r.cost], sort: [[r.scheduledFor, 'desc']] }))
  .filters((r, w) => [w.facets(r.vendorId), w.dateRange(r.scheduledFor, { presets: ['7d', '30d', '90d'] })])
  .layout((r) => [
    l.section('Visit', [r.ticketId, r.vendorId, r.scheduledFor, r.completedOn]),
    l.section('Invoice', [r.hours, r.cost, r.notes]),
  ])
