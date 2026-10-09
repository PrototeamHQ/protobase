import { view } from '@protobase/schema'
import type { locations } from './data'

export const locationsView = view<typeof locations>('locations')
  .names({ singular: 'Location', plural: 'Locations' })
  .list((r) => ({ columns: [r.path, r.name, r.warehouseId] }))
