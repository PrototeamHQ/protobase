import { readSearchFilter } from '../config/saved_searches/filter'
import { fitsSearch, type ListingRecord } from '../jobs/match'
import { agencyAt, type SeededAgency } from './builders/agency'
import { distanceKm } from './builders/distance'
import { listingAt, type SeededListing } from './builders/listing'
import { demoSearches, demoUsers, memberAt, savedBy, searchesOf, type SeededSearch, type SeededUser } from './builders/member'
import { DAY, seedNow } from './calendar'
import { places } from './data/places'
import { int, rngAt } from './rng'
import { scales, type ScaleName } from './scales'

export type SeededAlert = { search: SeededSearch; listing: SeededListing; matchedAt: number; emailedAt: number | null }

/** Alerts go back this far: what members heard of recently. */
const alertWindow = 30 * DAY

// The daily digest goes out at 7 in Amsterdam: 05:00 UTC in summer time, close enough for the sample.
const nextDigest = (after: number) => {
  const day = Math.floor(after / DAY) * DAY + 5 * 3_600_000
  return day > after ? day : day + DAY
}

// The listing as the match-listing job reads its row when it is published: available, by field name.
const recordOf = (listing: SeededListing): ListingRecord => ({
  id: listing.id, agency_id: listing.agencyId, place_id: listing.placeId, property_type: listing.propertyType, status: 'available',
  address: listing.address, postal_code: listing.postalCode, latitude: listing.latitude, longitude: listing.longitude,
  purchase_price: listing.purchasePrice, rent_price: listing.rentPrice, for_sale: listing.purchasePrice !== null, for_rent: listing.rentPrice !== null,
  living_area: listing.livingArea, plot_area: listing.plotArea, rooms: listing.rooms, bedrooms: listing.bedrooms, bathrooms: listing.bathrooms,
  built_year: listing.builtYear, energy_label: listing.energyLabel, garden: listing.garden, balcony: listing.balcony, parking: listing.parking,
  published_at: new Date(listing.publishedAt!),
})

// What the filter would refuse anyway, tested first so that the rule runs on fewer listings: the way it is offered and
// the type.
const mayFit = ({ criteria }: SeededSearch, listing: SeededListing) =>
  (criteria.forSale === criteria.forRent && !criteria.forSale) || (criteria.forSale && listing.purchasePrice !== null) || (criteria.forRent && listing.rentPrice !== null)
    ? criteria.propertyType === null || criteria.propertyType === listing.propertyType
    : false

/**
 * The alerts the match-listing job would have recorded: for every saved search, each listing published in the window,
 * after the search was saved, that fit it when it was published, as available, by the same rule the job uses. Only the
 * listings in a search's places, of its type and offered its way are tried; the rule decides.
 */
const alertsFor = (searches: SeededSearch[], listings: SeededListing[]) => {
  const recent = listings.filter((listing) => listing.publishedAt !== null && listing.publishedAt > seedNow - alertWindow)
  const byPlace = new Map<number, SeededListing[]>()
  for (const listing of recent) byPlace.set(listing.placeId, [...(byPlace.get(listing.placeId) ?? []), listing])
  const records = new Map(recent.map((listing) => [listing.id, recordOf(listing)]))
  const alerts: SeededAlert[] = []
  for (const search of searches) {
    const filter = readSearchFilter(search.filter)
    const rand = rngAt(601, search.id)
    const candidates = search.criteria.placeIds.length === 0 ? recent : search.criteria.placeIds.flatMap((id) => byPlace.get(id) ?? [])
    for (const listing of candidates) {
      if (listing.publishedAt! < search.createdAt || !mayFit(search, listing) || !fitsSearch(filter, records.get(listing.id)!)) continue
      const matchedAt = listing.publishedAt! + int(rand, 1, 5) * 60_000
      const mailed = search.alertFrequency === 'instant' ? matchedAt + 60_000 : search.alertFrequency === 'daily' ? nextDigest(matchedAt) : null
      alerts.push({ search, listing, matchedAt, emailedAt: mailed !== null && mailed <= seedNow ? mailed : null })
    }
  }
  return alerts
}

/** Everything the seed writes, built from the scale alone: the same rows every run. */
export const buildWorld = (scale: ScaleName) => {
  const counts = scales[scale]
  const agencies = Array.from({ length: counts.agencies }, (_, ordinal) => agencyAt(places, ordinal))
  const agenciesByPlace = new Map<number, SeededAgency[]>()
  for (const agency of agencies) agenciesByPlace.set(agency.placeId, [...(agenciesByPlace.get(agency.placeId) ?? []), agency])
  const agenciesByCountry = { NL: agencies.filter((agency) => agency.country === 'NL'), ES: agencies.filter((agency) => agency.country === 'ES') }
  if (agenciesByCountry.NL.length === 0 || agenciesByCountry.ES.length === 0) throw new Error('Every country needs an agency: raise the scale\'s agencies')
  const listings = Array.from({ length: counts.listings }, (_, ordinal) => listingAt(places, agenciesByPlace, agenciesByCountry, ordinal))

  const generated = Array.from({ length: counts.members - 2 }, (_, ordinal) => memberAt(ordinal))
  const users: SeededUser[] = [...demoUsers, ...generated]
  const searches = demoSearches(places)
  for (const [ordinal, user] of generated.entries()) searches.push(...searchesOf(places, user, ordinal, searches.length + 1))

  // Favorites among the published listings offered the way a member's first search looks, in or near its places.
  const published = listings.filter((listing) => listing.publishedAt !== null)
  const publishedIn = new Map<number, SeededListing[]>()
  for (const listing of published) publishedIn.set(listing.placeId, [...(publishedIn.get(listing.placeId) ?? []), listing])
  const shown = (search: SeededSearch | undefined) => {
    if (!search) return []
    const near = new Set(search.criteria.placeIds.flatMap((id) => places.flatMap((place, index) => (distanceKm(places[id - 1]!, place) <= 10 ? [index + 1] : []))))
    const pool = near.size > 0 ? [...near].flatMap((id) => publishedIn.get(id) ?? []) : published
    return pool.filter((listing) => (search.criteria.forSale && listing.purchasePrice !== null) || (search.criteria.forRent && listing.rentPrice !== null))
  }
  const saved = users.filter((user) => user.role === 'member').map((user, ordinal) => {
    const candidates = shown(searches.find((search) => search.userId === user.id))
    return { user, ...savedBy(user, ordinal, candidates, user.demo ? 5 : int(rngAt(504, ordinal), 0, 6)) }
  })

  return { places, agencies, listings, users, searches, saved, alerts: alertsFor(searches, listings) }
}

export type World = ReturnType<typeof buildWorld>
