import { bottomBar } from '@protobase/schema'

/** On phones, the warehouse floor's screens as tabs; "More" opens the rest. */
export const warehouseBar = bottomBar({ label: 'Warehouse', roles: ['warehouse'] }, (m) => [
  m.resource('stockLevels', { label: 'Stock' }),
  m.resource('stockMoves', { label: 'Moves' }),
  m.resource('orders', { label: 'Orders' }),
  m.resource('locations', { label: 'Locations' }),
])
