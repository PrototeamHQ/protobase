import { view } from '@protobase/schema'
import type { unitAmenities } from './data'

export const unitAmenitiesView = view<typeof unitAmenities>('unitAmenities')
  .nav({ hidden: true })
  .names({ singular: 'Unit amenity', plural: 'Unit amenities' })
  .fields((r) => ({ amenityCode: r.amenityCode.label('Amenity') }))
  .list((r) => ({ columns: [r.unitId, r.amenityCode, r.addedAt] }))
