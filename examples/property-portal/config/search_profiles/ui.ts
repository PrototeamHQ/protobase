import { l, view } from '@protobase/schema'
import { energyLabelLabels, propertyTypeLabels } from '../listings/labels'
import type { searchProfiles } from './data'

export const searchProfilesView = view<typeof searchProfiles>('search_profiles')
  .title((r) => r.name)
  .names({ singular: 'Search profile', plural: 'Search profiles' })
  .nav({ group: 'Yours', order: 4 })
  .help('What you are looking for. New listings that fit become alerts, mailed at once or in a morning digest.')
  .fields((r) => ({
    for_sale: r.for_sale.label('To buy'),
    for_rent: r.for_rent.label('To rent').help('Both: a home offered both ways fits either price range.'),
    place_id: r.place_id.label('Place').help('Empty: anywhere.'),
    radius_km: r.radius_km.label('Radius (km)').help('0: the place itself. Otherwise also the places this far from its centre.'),
    property_type: r.property_type.label('Type').valueLabels(propertyTypeLabels).help('Empty: any type.'),
    min_purchase_price: r.min_purchase_price.label('Minimum purchase price').prefix('€').decimals(0),
    max_purchase_price: r.max_purchase_price.label('Maximum purchase price').prefix('€').decimals(0),
    min_rent_price: r.min_rent_price.label('Minimum rent').prefix('€').suffix(' /month').decimals(0),
    max_rent_price: r.max_rent_price.label('Maximum rent').prefix('€').suffix(' /month').decimals(0),
    min_living_area: r.min_living_area.label('Minimum living area (m²)'),
    min_rooms: r.min_rooms.label('Minimum rooms'),
    min_energy_label: r.min_energy_label.label('Energy label').valueLabels(energyLabelLabels).help('This label or a better one.'),
    alert_frequency: r.alert_frequency.label('Alerts').format('badge').valueLabels({ instant: 'At once', daily: 'Daily digest' }),
    active: r.active.help('Off: no new alerts, the ones you have stay.'),
  }))
  .list((r) => ({ columns: [r.name, r.for_sale, r.for_rent, r.place_id, r.max_purchase_price, r.max_rent_price, r.alert_frequency, r.active], sort: [[r.created_at, 'desc']], search: [r.name] }))
  .filters((r, w) => [w.flags([r.for_sale, r.for_rent], { label: 'Looking' }), w.facets(r.alert_frequency), w.toggle(r.active)])
  .layout((r) => [
    l.section('Search', [r.name, r.for_sale, r.for_rent, r.place_id, r.radius_km, r.property_type]),
    l.section('Price', [r.min_purchase_price, r.max_purchase_price, r.min_rent_price, r.max_rent_price], { help: 'The purchase price when buying, the rent when renting. Empty: any price.' }),
    l.section('Size', [r.min_living_area, r.min_rooms, r.min_energy_label]),
    l.section('Alerts', [r.alert_frequency, r.active]),
    l.sidebar([r.for_sale, r.for_rent, r.alert_frequency, r.active]),
    l.related('Alerts', { resource: 'alerts', field: 'search_profile_id', sort: 'matched_at desc', columns: ['listing_id', 'matched_at', 'emailed_at', 'seen'], empty: 'No listing has fit yet.' }),
  ])
