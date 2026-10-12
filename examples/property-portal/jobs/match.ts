import { energyLabels } from '../config/listings/data'

type EnergyLabel = (typeof energyLabels)[number]
type Point = { latitude: number; longitude: number }

/** The listing as matching reads it: numbers as numbers, the energy label empty while it is pending. */
export type ListingFacts = Point & {
  offer_type: string
  property_type: string
  status: string
  place_id: number
  price: number
  living_area: number
  rooms: number
  energy_label: EnergyLabel | null
}

/** A search profile's criteria, each empty when it does not narrow; `centre` is its place's, for a radius. */
export type ProfileCriteria = {
  offer_type: string
  place_id: number | null
  centre: Point | null
  radius_km: number
  property_type: string | null
  min_price: number | null
  max_price: number | null
  min_living_area: number | null
  min_rooms: number | null
  min_energy_label: EnergyLabel | null
}

const earthRadiusKm = 6371

/** The great-circle distance between two points, in kilometres (haversine). */
export const distanceKm = (a: Point, b: Point) => {
  const rad = (degrees: number) => (degrees * Math.PI) / 180
  const dLat = rad(b.latitude - a.latitude)
  const dLon = rad(b.longitude - a.longitude)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2
  return 2 * earthRadiusKm * Math.asin(Math.sqrt(h))
}

// The place itself, or anywhere within the radius around its centre.
const inArea = (profile: ProfileCriteria, listing: ListingFacts) => {
  if (profile.place_id === null || profile.place_id === listing.place_id) return true
  return profile.radius_km > 0 && profile.centre !== null && distanceKm(profile.centre, listing) <= profile.radius_km
}

// Labels run best first, so a better label has a lower index; a pending label meets no minimum.
const meetsLabel = (minimum: EnergyLabel | null, label: EnergyLabel | null) =>
  minimum === null || (label !== null && energyLabels.indexOf(label) <= energyLabels.indexOf(minimum))

const atLeast = (minimum: number | null, value: number) => minimum === null || value >= minimum
const atMost = (maximum: number | null, value: number) => maximum === null || value <= maximum

/** Whether an available listing fits every criterion of a search profile. */
export const matchesProfile = (profile: ProfileCriteria, listing: ListingFacts) =>
  listing.status === 'available' &&
  profile.offer_type === listing.offer_type &&
  (profile.property_type === null || profile.property_type === listing.property_type) &&
  atLeast(profile.min_price, listing.price) &&
  atMost(profile.max_price, listing.price) &&
  atLeast(profile.min_living_area, listing.living_area) &&
  atLeast(profile.min_rooms, listing.rooms) &&
  meetsLabel(profile.min_energy_label, listing.energy_label) &&
  inArea(profile, listing)
