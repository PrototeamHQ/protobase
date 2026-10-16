import { l, view } from '@protobase/schema'
import type { places } from './data'

export const placesView = view<typeof places>('places')
  .title((r) => r.name)
  .names({ singular: 'Place', plural: 'Places' })
  .recordMode('read')
  .helpWhen('editing')
  .nav({ group: 'Browse', order: 3 })
  .fields((r) => ({
    region: r.region.help('The province in the Netherlands, the autonomous community in Spain.'),
    country: r.country.format('badge').valueLabels({ NL: 'Netherlands', ES: 'Spain' }),
    latitude: r.latitude.help('The centre, in decimal degrees (WGS84), that a search around the place measures from.').decimals(6),
    longitude: r.longitude.help('Decimal degrees, WGS84.').decimals(6),
  }))
  .list((r) => ({ columns: [r.name, r.region, r.country], sort: [[r.name, 'asc']], search: [r.name, r.region] }))
  .filters((r, w) => [w.facets(r.country), w.facets(r.region, { search: true })])
  .layout((r) => [
    l.section('Place', [r.name, r.region, r.country]),
    l.section('Centre', [r.latitude, r.longitude]),
    l.related('Listings', { resource: 'listings', field: 'place_id', sort: 'published_at desc', columns: ['address', 'property_type', 'purchase_price', 'rent_price', 'status'] }),
    l.related('Agencies', { resource: 'agencies', field: 'place_id', columns: ['name', 'phone', 'website'] }),
  ])
