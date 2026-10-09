import { l, view } from '@protobase/schema'
import type { properties } from './data'

export const propertiesView = view<typeof properties>('properties')
  .title((r) => r.name)
  .names({ singular: 'Property', plural: 'Properties' })
  .fields((r) => ({
    kind: r.kind.format('badge').valueLabels({ apartment_building: 'Apartment building', single_family: 'Single-family', mixed_use: 'Mixed-use' }),
    ownerId: r.ownerId.label('Owner'),
    latitude: r.latitude.help('Decimal degrees, WGS84.').decimals(6),
    longitude: r.longitude.help('Decimal degrees, WGS84.').decimals(6),
    builtYear: r.builtYear.label('Built'),
  }))
  .list((r) => ({ columns: [r.name, r.kind, r.city, r.postalCode, r.ownerId, r.builtYear], search: [r.name] }))
  .filters((r, w) => [w.facets(r.kind), w.facets(r.city), w.facets(r.ownerId, { search: true })])
  .layout((r) => [
    l.section('Property', [r.name, r.kind, r.ownerId, r.builtYear]),
    l.section('Address', [r.street, r.houseNumber, r.postalCode, r.city]),
    l.section('Location', [r.latitude, r.longitude], { help: 'Where the property is on a map.' }),
    l.sidebar([r.kind, r.city, r.ownerId]),
  ])
