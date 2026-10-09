import { customersView, repairsView as named } from './step-2'

// Step 3: the filters the front desk reaches for, and a chart of bookings above the list.

export { customersView }

export const repairsView = named
  .filters((r, w) => [
    w.facets(r.status),
    w.facets(r.mechanic, { search: true }),
    w.dateRange(r.bookedOn, { presets: ['7d', '30d', 'month'] }),
    w.range(r.estimate, { histogram: true }),
    w.toggle(r.paid),
  ])
  .chart((r) => ({ field: r.bookedOn, range: '30d', granularity: 'day' }))
