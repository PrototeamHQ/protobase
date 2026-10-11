import { component } from '@protobase/layout'
import { l } from '@protobase/schema'
import { repairsView as daily } from '../bike-shop/step-5'

// The bike shop's repairs as cards and as a workshop board beside the table, and a repair's page with the customer's
// earlier repairs: custom components inside the standard `/repairs` and `/repairs/<key>` pages.

/** A column per value of `by`, drawn by the `RepairBoard` export of protobase.ui.tsx. */
export const RepairBoard = component<{ by: string }>('RepairBoard')

/** The other repairs of the repair's customer, drawn by the `CustomerRepairs` export of protobase.ui.tsx. */
export const CustomerRepairs = component<{ limit: number }>('CustomerRepairs')

export const repairsView = daily
  .list((r, d) => ({
    columns: [r.number, r.customer_id, r.bike, r.status, r.estimate, r.booked_on],
    sort: [[r.booked_on, 'desc']],
    search: [r.number, r.bike],
    displays: [
      d.cards({ title: r.bike, subtitle: r.customer_id, badge: r.status, meta: [r.number, r.booked_on] }),
      d.custom(RepairBoard, { name: 'board', label: 'Board', icon: 'kanban', fields: [r.number, r.bike, r.mechanic, r.status], props: { by: r.status } }),
    ],
    default: 'board',
  }))
  .layout((r) => [
    l.section('The bike', [r.customer_id, r.bike, r.problem]),
    l.section('In the workshop', [r.status, r.mechanic, r.notes]),
    l.custom(CustomerRepairs, { title: 'Earlier repairs of this customer', props: { limit: 5 } }),
    l.sidebar([r.status, r.estimate, r.booked_on]),
  ])
