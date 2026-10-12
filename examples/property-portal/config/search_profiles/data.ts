import { f, resource } from '@protobase/schema'
import { energyLabels, propertyTypes } from '../listings/data'

/**
 * members.search_profiles: what a member is looking for, and how often they hear of new listings that fit. Theirs alone
 * (`.own` on `user_id`). An empty criterion matches every listing; `radius_km` widens the place to a circle around its
 * centre, and `min_energy_label` takes that label or a better one.
 */
export const searchProfiles = resource('search_profiles')
  .table('members.search_profiles')
  .fields({
    id: f.bigint().readOnly().filterable().sortable().dbDefault(),
    user_id: f.text().readOnly().filterable(),
    name: f.text().min(1).sortable(),
    offer_type: f.enum(['sale', 'rent']).filterable().sortable(),
    place_id: f.relation('places').optional().filterable().sortable(),
    radius_km: f.integer().min(0).max(50).default(0),
    property_type: f.enum(propertyTypes).optional().filterable(),
    min_price: f.decimal({ precision: 12, scale: 2 }).optional(),
    max_price: f.decimal({ precision: 12, scale: 2 }).optional().sortable(),
    min_living_area: f.integer().min(1).optional(),
    min_rooms: f.integer().min(1).optional(),
    min_energy_label: f.enum(energyLabels).optional(),
    alert_frequency: f.enum(['instant', 'daily']).default('daily').filterable().sortable(),
    active: f.boolean().default(true).filterable(),
    created_at: f.timestamp().readOnly().filterable().sortable().dbDefault(),
    updated_at: f.timestamp().readOnly().dbDefault(),
  })
  .primaryKey((r) => r.id)
  .owner((r) => r.user_id)
  .search((r) => [r.name])
  .validate((record) =>
    record.min_price != null && record.max_price != null && Number(record.max_price) < Number(record.min_price)
      ? [{ field: 'max_price', message: 'At least the minimum price' }]
      : undefined,
  )
