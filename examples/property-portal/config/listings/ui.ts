import { l, view } from '@protobase/schema'
import type { listings } from './data'
import { energyLabelLabels, offerTypeLabels, propertyTypeLabels } from './labels'

/** What everyone sees of a listing: the cards with their photos first, the table and the filters of a portal. */
export const listingsView = view<typeof listings>('listings')
  .title((r) => r.address)
  .names({ singular: 'Listing', plural: 'Listings' })
  .nav({ group: 'Browse', order: 1 })
  .searchResult((r) => ({ title: r.address, subtitle: r.place_id }))
  .fields((r) => ({
    agency_id: r.agency_id.label('Agency'),
    postal_code: r.postal_code.label('Postal code'),
    place_id: r.place_id.label('Place'),
    offer_type: r.offer_type.format('badge').valueLabels(offerTypeLabels),
    property_type: r.property_type.label('Type').valueLabels(propertyTypeLabels),
    status: r.status.format('badge').valueLabels({ available: 'Available', under_offer: 'Under offer', sold: 'Sold', let: 'Let' }),
    price: r.price.prefix('€').decimals(0).help('The asking price, or the rent per month.'),
    price_per_m2: r.price_per_m2.label('Price per m²').prefix('€').decimals(0),
    living_area: r.living_area.label('Living area (m²)'),
    plot_area: r.plot_area.label('Plot (m²)'),
    built_year: r.built_year.label('Built'),
    energy_label: r.energy_label.label('Energy label').format('badge').valueLabels(energyLabelLabels),
    latitude: r.latitude.help('Decimal degrees, WGS84.').decimals(6),
    longitude: r.longitude.help('Decimal degrees, WGS84.').decimals(6),
    photo: r.photo.label('Cover photo'),
    agent_name: r.agent_name.label('Agent'),
    agent_phone: r.agent_phone.label('Agent phone'),
    published_at: r.published_at.label('Published').help('Empty while the listing is a draft that only admins see.'),
  }))
  .list((r, d) => ({
    columns: [r.address, r.place_id, r.offer_type, r.property_type, r.price, r.living_area, r.rooms, r.energy_label, r.status, r.published_at],
    sort: [[r.published_at, 'desc']],
    search: [r.address, r.postal_code],
    displays: [d.cards({ image: r.photo, title: r.address, subtitle: r.place_id, badge: r.status, meta: [r.price, r.living_area, r.bedrooms, r.energy_label] }, { label: 'Photos' })],
    default: 'cards',
  }))
  .filters((r, w) => [
    w.facets(r.offer_type),
    w.facets(r.place_id, { search: true }),
    w.facets(r.property_type),
    w.range(r.price, { histogram: true }),
    w.range(r.living_area),
    w.facets(r.bedrooms),
    w.facets(r.energy_label),
    w.facets(r.status),
    w.toggle(r.garden),
    w.toggle(r.balcony),
    w.toggle(r.parking),
  ])
  .layout((r) => [
    l.section('Listing', [r.address, r.postal_code, r.place_id, r.offer_type, r.property_type, r.status, r.price, r.price_per_m2]),
    l.section('Size', [r.living_area, r.plot_area, r.rooms, r.bedrooms, r.bathrooms, r.built_year, r.energy_label]),
    l.section('About', [r.description, r.garden, r.balcony, r.parking]),
    l.section('Viewing', [r.agency_id, r.agent_name, r.agent_phone], { help: 'Call the agent to plan a viewing.' }),
    l.section('Location', [r.latitude, r.longitude]),
    l.section('Publishing', [r.photo, r.published_at]),
    l.sidebar([r.status, r.price, r.published_at]),
    l.related('Photos', { resource: 'listing_photos', field: 'listing_id', sort: 'position', columns: ['caption', 'photo'] }),
    l.related('Your notes', { resource: 'notes', field: 'listing_id', sort: 'updated_at desc', columns: ['body', 'updated_at'], empty: 'No notes yet: only you see the notes you add.' }),
  ])

/**
 * Signed in, a listing can be saved to favorites, taken off them again, and noted on. The note's form starts with the
 * listing chosen; whoever writes it is its only reader.
 */
export const memberListingsView = listingsView
  .actions((a) => [
    a.action('save_favorite', { label: 'Save to favorites' }),
    a.action('remove_favorite', { label: 'Remove from favorites' }),
    a.link('add_note', { label: 'Add a note', icon: 'file-text', to: { kind: 'create', resource: 'notes', values: { listing_id: '{id}' } } }),
  ])
  .forRoles(['member', 'admin'])
