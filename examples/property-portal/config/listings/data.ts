import { f, resource } from '@protobase/schema'
import { photoVariants } from '../photo-variants'
import { listingIssues } from './rules'

export const energyLabels = ['a_plus_4', 'a_plus_3', 'a_plus_2', 'a_plus', 'a', 'b', 'c', 'd', 'e', 'f', 'g'] as const
export const propertyTypes = ['apartment', 'house', 'townhouse', 'villa', 'studio', 'penthouse'] as const

/**
 * market.listings: a home for sale, for rent, or both, as a Dutch home for sale is often let in the meantime
 * (leegstandswet). `purchase_price` is the asking price and `rent_price` the rent per month; at least one is set, and
 * Postgres computes from them whether it is `for_sale` and `for_rent`, and `price_per_m2` from the purchase price. A
 * listing is public from `published_at`, a draft while that is empty; publishing one asks the match-listing job for the
 * saved searches it fits (db/migrations/005_listing_published.sql).
 */
export const listings = resource('listings')
  .table('market.listings')
  .fields({
    id: f.bigint().readOnly().filterable().sortable().dbDefault(),
    agency_id: f.relation('agencies').filterable().sortable(),
    place_id: f.relation('places').filterable().sortable(),
    property_type: f.enum(propertyTypes).filterable().sortable(),
    status: f.enum(['available', 'under_offer', 'sold', 'let']).default('available').filterable().sortable(),
    address: f.text().filterable().sortable(),
    postal_code: f.text().filterable(),
    latitude: f.decimal({ precision: 8, scale: 6 }).filterable(),
    longitude: f.decimal({ precision: 9, scale: 6 }).filterable(),
    position_exact: f.boolean().default(true),
    purchase_price: f.decimal({ precision: 12, scale: 2 }).optional().filterable().sortable(),
    rent_price: f.decimal({ precision: 12, scale: 2 }).optional().filterable().sortable(),
    for_sale: f.boolean().readOnly().filterable().sortable(),
    for_rent: f.boolean().readOnly().filterable().sortable(),
    living_area: f.integer().min(1).filterable().sortable(),
    price_per_m2: f.decimal({ precision: 10, scale: 2 }).readOnly().optional().filterable().sortable(),
    plot_area: f.integer().min(1).optional().filterable().sortable(),
    rooms: f.integer().min(1).filterable().sortable(),
    bedrooms: f.integer().min(0).filterable().sortable(),
    bathrooms: f.integer().min(0).default(1),
    built_year: f.integer().min(1500).max(2100).optional().filterable().sortable(),
    energy_label: f.enum(energyLabels).optional().filterable().sortable(),
    garden: f.boolean().default(false).filterable(),
    balcony: f.boolean().default(false).filterable(),
    parking: f.boolean().default(false).filterable(),
    description: f.text(),
    photo: f.file().accept(['image/*']).public().optional().placeholder('photo_placeholder').variants(photoVariants),
    photo_placeholder: f.text().readOnly().optional(),
    agent_name: f.text(),
    agent_phone: f.text(),
    published_at: f.timestamp().optional().filterable().sortable(),
    created_at: f.timestamp().readOnly().filterable().sortable().dbDefault(),
    updated_at: f.timestamp().readOnly().dbDefault(),
  })
  .primaryKey((r) => r.id)
  .search((r) => [r.address, r.postal_code])
  .validate(listingIssues)
