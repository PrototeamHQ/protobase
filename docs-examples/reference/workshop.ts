import { component } from '@protobase/layout'
import { l } from '@protobase/schema'
import { repairsView as daily } from '../bike-shop/step-5'

// The bike shop's repairs as cards, as a workshop board and on a calendar of their booking days beside the table, and a
// repair's page with the customer's earlier repairs: a custom component inside the standard `/repairs/<key>` page.

/** The other repairs of the repair's customer, drawn by the `CustomerRepairs` export of protobase.ui.tsx. */
export const CustomerRepairs = component<{ limit: number }>('CustomerRepairs')

export const repairsView = daily
  .list((r, d) => ({
    columns: [r.number, r.customer_id, r.bike, r.status, r.estimate, r.booked_on],
    sort: [[r.booked_on, 'desc']],
    search: [r.number, r.bike],
    displays: [
      d.cards({ title: r.bike, subtitle: r.customer_id, badge: r.status, meta: [r.number, r.booked_on] }),
      d.board({ by: r.status, title: r.number, subtitle: r.bike, meta: [r.mechanic] }),
      d.calendar({ start: r.booked_on, title: r.number }),
    ],
    default: 'board',
    // A repair moves to another column of the board by dragging it
    drag: { board: true },
  }))
  .layout((r) => [
    l.section('The bike', [r.customer_id, r.bike, r.problem]),
    l.section('In the workshop', [r.status, r.mechanic, r.notes]),
    l.custom(CustomerRepairs, { title: 'Earlier repairs of this customer', props: { limit: 5 } }),
    l.sidebar([r.status, r.estimate, r.booked_on]),
  ])
