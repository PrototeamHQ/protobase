import { distanceKm, matchesProfile, type ProfileCriteria } from '../jobs/match'
import { agencyAt, type SeededAgency } from './builders/agency'
import { listingAt, type SeededListing } from './builders/listing'
import { demoProfiles, demoUsers, memberAt, profilesOf, savedBy, type SeededProfile, type SeededUser } from './builders/member'
import { DAY, seedNow } from './calendar'
import { places } from './data/places'
import { int, rngAt } from './rng'
import { scales, type ScaleName } from './scales'

export type SeededAlert = { profile: SeededProfile; listing: SeededListing; matchedAt: number; emailedAt: number | null; seen: boolean }

/** Alerts go back this far: what members heard of recently. */
const alertWindow = 30 * DAY

// Listings sit up to about 3 km from their place's centre (builders/listing.ts).
const scatterKm = 4

const criteriaOf = (profile: SeededProfile): ProfileCriteria => {
  const place = profile.placeId === null ? undefined : places[profile.placeId - 1]!
  return {
    for_sale: profile.forSale,
    for_rent: profile.forRent,
    place_id: profile.placeId,
    centre: place ? { latitude: place.latitude, longitude: place.longitude } : null,
    radius_km: profile.radiusKm,
    property_type: profile.propertyType,
    min_purchase_price: profile.minPurchasePrice,
    max_purchase_price: profile.maxPurchasePrice,
    min_rent_price: profile.minRentPrice,
    max_rent_price: profile.maxRentPrice,
    min_living_area: profile.minLivingArea,
    min_rooms: profile.minRooms,
    min_energy_label: profile.minEnergyLabel,
  }
}

// The daily digest goes out at 7 in Amsterdam: 05:00 UTC in summer time, close enough for the sample.
const nextDigest = (after: number) => {
  const day = Math.floor(after / DAY) * DAY + 5 * 3_600_000
  return day > after ? day : day + DAY
}

/**
 * The alerts the match-listing job would have recorded: for every active profile, each listing published in the
 * window, after the profile was made, that fit it when it was published, as available, with the same rule the job uses.
 */
const alertsFor = (profiles: SeededProfile[], listings: SeededListing[]) => {
  const recent = listings.filter((listing) => listing.publishedAt !== null && listing.publishedAt > seedNow - alertWindow)
  const byPlace = new Map<number, SeededListing[]>()
  for (const listing of recent) byPlace.set(listing.placeId, [...(byPlace.get(listing.placeId) ?? []), listing])
  const near = (profile: SeededProfile) => {
    if (profile.placeId === null) return recent
    const centre = places[profile.placeId - 1]!
    return places.flatMap((place, index) => (index + 1 === profile.placeId || distanceKm(centre, place) <= profile.radiusKm + scatterKm ? (byPlace.get(index + 1) ?? []) : []))
  }
  const alerts: SeededAlert[] = []
  for (const profile of profiles) {
    if (!profile.active) continue
    const criteria = criteriaOf(profile)
    const rand = rngAt(601, profile.id)
    for (const listing of near(profile)) {
      if (listing.publishedAt! < profile.createdAt) continue
      const facts = {
        property_type: listing.propertyType, status: 'available', place_id: listing.placeId, latitude: listing.latitude, longitude: listing.longitude,
        purchase_price: listing.purchasePrice, rent_price: listing.rentPrice, living_area: listing.livingArea, rooms: listing.rooms, energy_label: listing.energyLabel,
      }
      if (!matchesProfile(criteria, facts)) continue
      const matchedAt = listing.publishedAt! + int(rand, 1, 5) * 60_000
      const mailed = profile.alertFrequency === 'instant' ? matchedAt + 60_000 : nextDigest(matchedAt)
      alerts.push({ profile, listing, matchedAt, emailedAt: mailed <= seedNow ? mailed : null, seen: seedNow - matchedAt > 5 * DAY && rand() < 0.8 })
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
  const profiles = demoProfiles(places)
  for (const [ordinal, user] of generated.entries()) profiles.push(...profilesOf(places, user, ordinal, profiles.length + 1))

  // Favorites among the published listings offered the way a member's first profile looks, in or near its place.
  const published = listings.filter((listing) => listing.publishedAt !== null)
  const publishedIn = new Map<number, SeededListing[]>()
  for (const listing of published) publishedIn.set(listing.placeId, [...(publishedIn.get(listing.placeId) ?? []), listing])
  const shown = (profile: SeededProfile | undefined) => {
    if (!profile) return []
    const centre = profile.placeId === null ? undefined : places[profile.placeId - 1]!
    const pool = centre ? places.flatMap((place, index) => (distanceKm(centre, place) <= Math.max(profile.radiusKm, 10) ? (publishedIn.get(index + 1) ?? []) : [])) : published
    return pool.filter((listing) => (profile.forSale && listing.purchasePrice !== null) || (profile.forRent && listing.rentPrice !== null))
  }
  const saved = users.filter((user) => user.role === 'member').map((user, ordinal) => {
    const candidates = shown(profiles.find((profile) => profile.userId === user.id))
    return { user, ...savedBy(user, ordinal, candidates, user.demo ? 5 : int(rngAt(504, ordinal), 0, 6)) }
  })

  return { places, agencies, listings, users, profiles, saved, alerts: alertsFor(profiles, listings) }
}

export type World = ReturnType<typeof buildWorld>
