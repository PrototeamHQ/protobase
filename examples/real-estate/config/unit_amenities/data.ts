import { f, resource } from '@protobase/schema'
import { access } from '../roles'

/** portfolio.unit_amenities, the join between units and amenities. */
export const unitAmenities = resource('unit_amenities')
  .table('portfolio.unit_amenities')
  .fields({
    unit_id: f.relation('units').filterable().sortable(),
    amenity_code: f.relation('amenities').filterable().sortable(),
    organization_id: f.relation('organizations').filterable().sortable(),
    added_at: f.timestamp().dbDefault(),
  })
  .primaryKey((r) => [r.unit_id, r.amenity_code])
  .tenant((r) => r.organization_id)
  .access(access('unit_amenities'))
