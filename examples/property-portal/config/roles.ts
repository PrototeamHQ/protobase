import { defineRoles } from '@protobase/schema'

/** The resources of the portal. */
export type PortalName = 'places' | 'agencies' | 'listings' | 'listing_photos' | 'saved_searches' | 'alerts' | 'favorites' | 'notes'

/** What a listing shows to someone who is not signed in: everything but the agent to call, and only once published. */
export const publicListingFields = [
  'agency_id', 'place_id', 'property_type', 'status', 'address', 'postal_code', 'latitude', 'longitude',
  'purchase_price', 'rent_price', 'for_sale', 'for_rent', 'living_area', 'price_per_m2', 'plot_area', 'rooms', 'bedrooms', 'bathrooms', 'built_year', 'energy_label',
  'garden', 'balcony', 'parking', 'description', 'photo', 'photo_placeholder', 'published_at',
]

const published = 'published_at:*'

// A member's own saved searches, alerts, favorites and notes: `.own` limits each to the rows whose `user_id` is theirs,
// and a create is owned by whoever makes it. Alerts are made by the matching job; a member reads or removes them.
const ownData = [
  'saved_searches.*.own', 'favorites.read.own', 'favorites.create.own', 'favorites.delete.own', 'notes.*.own',
  'alerts.read.own', 'alerts.delete.own',
] as const

/**
 * Capabilities are `<resource>.<action>[.own]`. Visitors read the published listings, their photos, agencies and places
 * through the fields listed here; members also see who to call, and keep their own searches, alerts, favorites and
 * notes, which nobody else sees, admins included. Admins run the catalogue: places, agencies and listings, drafts too.
 * Passed to the server, they decide every operation: no resource has rules of its own.
 */
export const roles = defineRoles<PortalName>({
  admin: ['places.*', 'agencies.*', 'listings.*', 'listing_photos.*', ...ownData],
  member: [
    'places.read', 'agencies.read', { 'listings.read': { filter: published } }, 'listing_photos.read',
    ...ownData,
  ],
  anonymous: [
    { 'places.read': ['name', 'region', 'country', 'latitude', 'longitude'] },
    { 'agencies.read': ['name', 'place_id', 'phone', 'email', 'website'] },
    { 'listings.read': { fields: publicListingFields, filter: published } },
    { 'listing_photos.read': ['listing_id', 'position', 'photo', 'photo_placeholder', 'caption'] },
  ],
})
