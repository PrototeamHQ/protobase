import { view } from '@protobase/schema'
import type { amenities } from './data'

export const amenitiesView = view<typeof amenities>('amenities')
  .names({ singular: 'Amenity', plural: 'Amenities' })
  .fields((r) => ({ code: r.code.format('code') }))
  .list((r) => ({ columns: [r.name, r.code] }))
