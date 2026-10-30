import { l, view } from '@protobase/schema'
import type { workOrders } from './data'

export const workOrdersView = view<typeof workOrders>('work_orders')
  .names({ singular: 'Work order', plural: 'Work orders' })
  .fields((r) => ({
    ticket_id: r.ticket_id.label('Ticket'),
    vendor_id: r.vendor_id.label('Vendor'),
    scheduled_for: r.scheduled_for.label('Visit'),
    completed_on: r.completed_on.label('Completed'),
    cost: r.cost.help('Labour and materials, as invoiced by the vendor.').prefix('€').currency('EUR').decimals(2),
  }))
  .list((r) => ({ columns: [r.ticket_id, r.vendor_id, r.scheduled_for, r.completed_on, r.cost], sort: [[r.scheduled_for, 'desc']] }))
  .filters((r, w) => [w.facets(r.vendor_id), w.dateRange(r.scheduled_for, { presets: ['7d', '30d', '90d'] })])
  .layout((r) => [
    l.section('Visit', [r.ticket_id, r.vendor_id, r.scheduled_for, r.completed_on]),
    l.section('Invoice', [r.hours, r.cost, r.notes]),
  ])
