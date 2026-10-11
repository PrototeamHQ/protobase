import { view } from '@protobase/schema'
import type { unitAmenities } from './data'

export const unitAmenitiesView = view<typeof unitAmenities>('unit_amenities')
  .nav({ hidden: true })
  .names({ singular: 'Unit amenity', plural: 'Unit amenities' })
  .fields((r) => ({ amenity_code: r.amenity_code.label('Amenity') }))
  .list((r) => ({ columns: [r.unit_id, r.amenity_code, r.added_at] }))
