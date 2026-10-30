import { view } from '@protobase/schema'
import type { customers, repairs } from './data'

// Step 2: names, what a record is called, the columns the workshop reads, and how values look.

export const customersView = view<typeof customers>('customers')
  .names({ singular: 'Customer', plural: 'Customers' })
  .title((r) => r.name)
  .list((r) => ({ columns: [r.name, r.phone, r.email], sort: [[r.name, 'asc']] }))

export const repairsView = view<typeof repairs>('repairs')
  .names({ singular: 'Repair', plural: 'Repairs' })
  .title((r) => r.number)
  .fields((r) => ({
    number: r.number.format('code'),
    customer_id: r.customer_id.label('Customer'),
    status: r.status.format('badge'),
    estimate: r.estimate.prefix('€').currency('EUR').decimals(2),
    booked_on: r.booked_on.label('Booked on'),
  }))
  .list((r) => ({
    columns: [r.number, r.customer_id, r.bike, r.status, r.mechanic, r.estimate, r.booked_on],
    sort: [[r.booked_on, 'desc']],
    search: [r.number, r.bike],
  }))
