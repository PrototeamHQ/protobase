import { f, resource } from '@protobase/schema'

/** market.places: a town or city homes are listed in, with its centre for searching around it. Unique: (country, name). */
export const places = resource('places')
  .table('market.places')
  .fields({
    id: f.integer().readOnly().filterable().sortable().dbDefault(),
    name: f.text().filterable().sortable(),
    region: f.text().filterable().sortable(),
    country: f.enum(['NL', 'ES']).filterable().sortable(),
    latitude: f.decimal({ precision: 8, scale: 6 }),
    longitude: f.decimal({ precision: 9, scale: 6 }),
  })
  .primaryKey((r) => r.id)
  .search((r) => [r.name, r.region])
