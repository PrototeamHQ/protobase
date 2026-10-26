import { f, resource } from '@protobase/schema'

/** market.agencies: an estate agent (makelaar, inmobiliaria) that lists homes on the portal. */
export const agencies = resource('agencies')
  .table('market.agencies')
  .fields({
    id: f.integer().readOnly().filterable().sortable().dbDefault(),
    name: f.text().filterable().sortable(),
    place_id: f.relation('places').filterable().sortable(),
    phone: f.text(),
    email: f.text().regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'An email address, such as info@agency.example'),
    website: f.text().regex(/^https:\/\//, 'A web address starting with https://'),
    created_at: f.timestamp().readOnly().filterable().sortable().dbDefault(),
    updated_at: f.timestamp().readOnly().dbDefault(),
  })
  .primaryKey((r) => r.id)
  .search((r) => [r.name])
