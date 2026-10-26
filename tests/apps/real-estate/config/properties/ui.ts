import { l, view } from '@protobase/schema'
import type { properties } from './data'

export const propertiesView = view<typeof properties>('properties')
  .title((r) => r.name)
  .names({ singular: 'Property', plural: 'Properties' })
  .fields((r) => ({
    kind: r.kind.format('badge').valueLabels({ apartment_building: 'Apartment building', single_family: 'Single-family', mixed_use: 'Mixed-use' }),
    owner_id: r.owner_id.label('Owner'),
    latitude: r.latitude.help('Decimal degrees, WGS84.').decimals(6),
    longitude: r.longitude.help('Decimal degrees, WGS84.').decimals(6),
    built_year: r.built_year.label('Built'),
  }))
  .list((r) => ({ columns: [r.name, r.kind, r.city, r.postal_code, r.owner_id, r.built_year], search: [r.name] }))
  .filters((r, w) => [w.facets(r.kind), w.facets(r.city), w.facets(r.owner_id, { search: true })])
  .layout((r) => [
    l.section('Property', [r.name, r.kind, r.owner_id, r.built_year]),
    l.section('Address', [r.street, r.house_number, r.postal_code, r.city]),
    l.section('Location', [r.latitude, r.longitude], { help: 'Where the property is on a map.' }),
    l.sidebar([r.kind, r.city, r.owner_id]),
  ])
