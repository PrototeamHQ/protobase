import { l } from '@protobase/schema'
import { customersView, repairsView as laidOut } from './step-4'

// Step 5: buttons for the moves the shop makes all day, and a quieter view for the mechanics.

export { customersView }

export const repairsView = laidOut.actions((a) => [
  a.update('ready', { label: 'Ready for pickup', icon: 'send', set: { status: 'ready' } }),
  a.update('collect', { label: 'Collected and paid', icon: 'wallet', set: { status: 'collected', paid: true }, confirm: 'Has the customer paid and taken the bike?' }),
  a.link('customerRepairs', { label: 'Other repairs of this customer', icon: 'file-text', href: '/repairs?filter=customer_id%20%3D%20{customer_id}' }),
])

/** What mechanics get instead: no money, and their own move. */
export const workshopRepairsView = laidOut
  .forRoles(['mechanic'])
  .list((r) => ({ columns: [r.number, r.bike, r.problem, r.status, r.mechanic], sort: [[r.booked_on, 'asc']], search: [r.number, r.bike] }))
  .filters((r, w) => [w.facets(r.status), w.facets(r.mechanic, { search: true }), w.dateRange(r.booked_on, { presets: ['7d', '30d', 'month'] })])
  .layout((r) => [l.section('The bike', [r.bike, r.problem]), l.section('In the workshop', [r.status, r.mechanic, r.notes]), l.sidebar([r.status, r.booked_on])])
  .actions((a) => [a.update('ready', { label: 'Ready for pickup', icon: 'send', set: { status: 'ready' } })])
