import { bottomBar } from '@protobase/schema'

/** On phones, the warehouse floor's screens as tabs; "More" opens the rest. */
export const warehouseBar = bottomBar({ label: 'Warehouse', roles: ['warehouse'] }, (m) => [
  m.resource('stock_levels', { label: 'Stock' }),
  m.resource('stock_moves', { label: 'Moves' }),
  m.resource('orders', { label: 'Orders' }),
  m.resource('locations', { label: 'Locations' }),
])
