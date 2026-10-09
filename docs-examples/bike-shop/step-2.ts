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
    customerId: r.customerId.label('Customer'),
    status: r.status.format('badge'),
    estimate: r.estimate.prefix('€').decimals(2),
    bookedOn: r.bookedOn.label('Booked on'),
  }))
  .list((r) => ({
    columns: [r.number, r.customerId, r.bike, r.status, r.mechanic, r.estimate, r.bookedOn],
    sort: [[r.bookedOn, 'desc']],
    search: [r.number, r.bike],
  }))
