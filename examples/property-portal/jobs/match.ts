import { energyLabels } from '../config/listings/data'

type EnergyLabel = (typeof energyLabels)[number]
type Point = { latitude: number; longitude: number }

/** The listing as matching reads it: numbers as numbers, a price empty when it is not offered that way, the energy label empty while it is pending. */
export type ListingFacts = Point & {
  property_type: string
  status: string
  place_id: number
  purchase_price: number | null
  rent_price: number | null
  living_area: number
  rooms: number
  energy_label: EnergyLabel | null
}

/** A search profile's criteria, each empty when it does not narrow; `centre` is its place's, for a radius. */
export type ProfileCriteria = {
  for_sale: boolean
  for_rent: boolean
  place_id: number | null
  centre: Point | null
  radius_km: number
  property_type: string | null
  min_purchase_price: number | null
  max_purchase_price: number | null
  min_rent_price: number | null
  max_rent_price: number | null
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
const within = (minimum: number | null, maximum: number | null, price: number | null) => price !== null && atLeast(minimum, price) && atMost(maximum, price)

// To buy at a purchase price in its range, or to rent at a rent in its range: a listing offered both ways fits either.
const fitsOffer = (profile: ProfileCriteria, listing: ListingFacts) =>
  (profile.for_sale && within(profile.min_purchase_price, profile.max_purchase_price, listing.purchase_price)) ||
  (profile.for_rent && within(profile.min_rent_price, profile.max_rent_price, listing.rent_price))

/** Whether an available listing fits every criterion of a search profile. */
export const matchesProfile = (profile: ProfileCriteria, listing: ListingFacts) =>
  listing.status === 'available' &&
  fitsOffer(profile, listing) &&
  (profile.property_type === null || profile.property_type === listing.property_type) &&
  atLeast(profile.min_living_area, listing.living_area) &&
  atLeast(profile.min_rooms, listing.rooms) &&
  meetsLabel(profile.min_energy_label, listing.energy_label) &&
  inArea(profile, listing)
