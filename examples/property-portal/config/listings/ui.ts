import { l, view } from '@protobase/schema'
import type { listings } from './data'
import { energyLabelColors, energyLabelLabels, propertyTypeLabels } from './labels'

/** What everyone sees of a listing: the cards with their photos first, arrows through the rest, the table and the filters of a portal. */
export const listingsView = view<typeof listings>('listings')
  .title((r) => r.address)
  .names({ singular: 'Listing', plural: 'Listings' })
  .nav({ group: 'Browse', order: 1 })
  .searchResult((r) => ({ title: r.address, subtitle: r.place_id }))
  .fields((r) => ({
    agency_id: r.agency_id.label('Agency'),
    postal_code: r.postal_code.label('Postal code'),
    place_id: r.place_id.label('Place'),
    property_type: r.property_type.label('Type').valueLabels(propertyTypeLabels),
    status: r.status.format('badge').valueLabels({ available: 'Available', under_offer: 'Under offer', sold: 'Sold', let: 'Let' }),
    purchase_price: r.purchase_price.label('Purchase price').prefix('€').decimals(0).help('The asking price. Empty when the home is not for sale.'),
    rent_price: r.rent_price.label('Rent').prefix('€').suffix(' /month').decimals(0).help('The rent per month. Empty when the home is not for rent.'),
    for_sale: r.for_sale.label('For sale'),
    for_rent: r.for_rent.label('For rent'),
    price_per_m2: r.price_per_m2.label('Price per m²').prefix('€').decimals(0).help('From the purchase price.'),
    living_area: r.living_area.label('Living area').suffix(' m²').icon('ruler'),
    plot_area: r.plot_area.label('Plot').suffix(' m²'),
    built_year: r.built_year.label('Built'),
    energy_label: r.energy_label.label('Energy label').format('badge').valueLabels(energyLabelLabels).valueColors(energyLabelColors).badgeShape('arrow'),
    latitude: r.latitude.help('Decimal degrees, WGS84.').decimals(6),
    longitude: r.longitude.help('Decimal degrees, WGS84.').decimals(6),
    photo: r.photo.label('Cover photo'),
    agent_name: r.agent_name.label('Agent'),
    agent_phone: r.agent_phone.label('Agent phone'),
    published_at: r.published_at.label('Published').help('Empty while the listing is a draft that only admins see.'),
  }))
  .list((r, d) => ({
    columns: [r.address, r.place_id, r.property_type, r.purchase_price, r.rent_price, r.living_area, r.rooms, r.energy_label, r.status, r.published_at],
    sort: [[r.published_at, 'desc']],
    search: [r.address, r.postal_code],
    displays: [
      d.cards(
        { image: r.photo, title: r.address, subtitle: r.place_id, badge: r.status, meta: [r.purchase_price, r.rent_price, r.living_area, r.bedrooms, r.energy_label], flags: [r.garden, r.balcony, r.parking] },
        { label: 'Photos', photos: { resource: 'listing_photos', field: 'listing_id', image: 'photo', sort: 'position' } },
      ),
    ],
    default: 'cards',
  }))
  .filters((r, w) => [
    w.flags([r.for_sale, r.for_rent], { label: 'Offer' }),
    w.facets(r.place_id, { search: true }),
    w.facets(r.property_type),
    w.range(r.purchase_price, { histogram: true }),
    w.range(r.rent_price, { histogram: true }),
    w.range(r.living_area),
    w.facets(r.bedrooms),
    w.facets(r.energy_label),
    w.facets(r.status),
    w.toggle(r.garden),
    w.toggle(r.balcony),
    w.toggle(r.parking),
  ])
  .layout((r) => [
    l.section('Listing', [r.address, r.postal_code, r.place_id, r.property_type, r.status]),
    l.section('Price', [r.purchase_price, r.rent_price, r.price_per_m2], { help: 'A purchase price, a rent or both: a home for sale can be let in the meantime.' }),
    l.section('Size', [r.living_area, r.plot_area, r.rooms, r.bedrooms, r.bathrooms, r.built_year, r.energy_label]),
    l.section('About', [r.description, r.garden, r.balcony, r.parking]),
    l.section('Viewing', [r.agency_id, r.agent_name, r.agent_phone], { help: 'Call the agent to plan a viewing.' }),
    l.map('Location', { latitude: r.latitude, longitude: r.longitude }),
    l.section('Coordinates', [r.latitude, r.longitude]),
    l.section('Publishing', [r.photo, r.published_at]),
    l.sidebar([r.status, r.purchase_price, r.rent_price, r.published_at]),
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
