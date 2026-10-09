import { f, resource } from '@protobase/schema'
import { access } from '../roles'

/** portfolio.unit_amenities, the join between units and amenities. */
export const unitAmenities = resource('unitAmenities')
  .table('portfolio.unit_amenities')
  .fields({
    unitId: f.relation('units').filterable().sortable(),
    amenityCode: f.relation('amenities').filterable().sortable(),
    organizationId: f.relation('organizations').filterable().sortable(),
    addedAt: f.timestamp().dbDefault(),
  })
  .primaryKey((r) => [r.unitId, r.amenityCode])
  .tenant((r) => r.organizationId)
  .access(access('unitAmenities'))
