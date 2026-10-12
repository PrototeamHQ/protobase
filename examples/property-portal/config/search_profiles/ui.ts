import { l, view } from '@protobase/schema'
import { energyLabelLabels, offerTypeLabels, propertyTypeLabels } from '../listings/labels'
import type { searchProfiles } from './data'

export const searchProfilesView = view<typeof searchProfiles>('search_profiles')
  .title((r) => r.name)
  .names({ singular: 'Search profile', plural: 'Search profiles' })
  .nav({ group: 'Yours', order: 4 })
  .help('What you are looking for. New listings that fit become alerts, mailed at once or in a morning digest.')
  .fields((r) => ({
    offer_type: r.offer_type.label('For').valueLabels(offerTypeLabels),
    place_id: r.place_id.label('Place').help('Empty: anywhere.'),
    radius_km: r.radius_km.label('Radius (km)').help('0: the place itself. Otherwise also the places this far from its centre.'),
    property_type: r.property_type.label('Type').valueLabels(propertyTypeLabels).help('Empty: any type.'),
    min_price: r.min_price.prefix('€').decimals(0),
    max_price: r.max_price.prefix('€').decimals(0).help('The asking price, or the rent per month.'),
    min_living_area: r.min_living_area.label('Minimum living area (m²)'),
    min_rooms: r.min_rooms.label('Minimum rooms'),
    min_energy_label: r.min_energy_label.label('Energy label').valueLabels(energyLabelLabels).help('This label or a better one.'),
    alert_frequency: r.alert_frequency.label('Alerts').format('badge').valueLabels({ instant: 'At once', daily: 'Daily digest' }),
    active: r.active.help('Off: no new alerts, the ones you have stay.'),
  }))
  .list((r) => ({ columns: [r.name, r.offer_type, r.place_id, r.max_price, r.alert_frequency, r.active], sort: [[r.created_at, 'desc']], search: [r.name] }))
  .filters((r, w) => [w.facets(r.offer_type), w.facets(r.alert_frequency), w.toggle(r.active)])
  .layout((r) => [
    l.section('Search', [r.name, r.offer_type, r.place_id, r.radius_km, r.property_type]),
    l.section('Price and size', [r.min_price, r.max_price, r.min_living_area, r.min_rooms, r.min_energy_label]),
    l.section('Alerts', [r.alert_frequency, r.active]),
    l.sidebar([r.offer_type, r.alert_frequency, r.active]),
    l.related('Alerts', { resource: 'alerts', field: 'search_profile_id', sort: 'matched_at desc', columns: ['listing_id', 'matched_at', 'emailed_at', 'seen'], empty: 'No listing has fit yet.' }),
  ])
