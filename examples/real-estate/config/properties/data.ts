import { f, resource } from '@protobase/schema'
import { access } from '../roles'

/** portfolio.properties: a building or a house, with its location as latitude and longitude. */
export const properties = resource('properties')
  .table('portfolio.properties')
  .fields({
    id: f.bigint().readOnly().filterable().sortable().dbDefault(),
    organization_id: f.relation('organizations').filterable().sortable(),
    owner_id: f.relation('owners').filterable().sortable(),
    name: f.text(),
    kind: f.enum(['apartment_building', 'single_family', 'mixed_use']).filterable().sortable(),
    street: f.text(),
    house_number: f.text(),
    postal_code: f.text().regex(/^[1-9]\d{3} [A-Z]{2}$/, 'A Dutch postal code, such as 1017 CT'),
    city: f.text().filterable().sortable(),
    latitude: f.decimal({ precision: 8, scale: 6 }).filterable().sortable(),
    longitude: f.decimal({ precision: 9, scale: 6 }),
    built_year: f.integer().min(1500).max(2100),
    created_at: f.timestamp().readOnly().filterable().sortable().dbDefault(),
    updated_at: f.timestamp().readOnly().dbDefault(),
  })
  .primaryKey((r) => r.id)
  .tenant((r) => r.organization_id)
  .search((r) => [r.name])
  .access(access('properties'))
