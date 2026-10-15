import { DAY, seedNow } from '../calendar'
import { agentNames, details, openings, streets } from '../data/names'
import type { PlaceSeed } from '../data/places'
import { exteriorPhoto, roomPhoto } from '../photos/library'
import type { PropertyType, RoomKind } from '../photos/draw'
import { int, pick, rngAt, weighted, type Rand } from '../rng'
import type { SeededAgency } from './agency'

type EnergyLabel = 'a_plus_4' | 'a_plus_3' | 'a_plus_2' | 'a_plus' | 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g'

export type SeededPhoto = { position: number; photo: string; caption: string }

export type SeededListing = {
  id: number
  agencyId: number
  placeId: number
  country: 'NL' | 'ES'
  propertyType: PropertyType
  status: 'available' | 'under_offer' | 'sold' | 'let'
  address: string
  postalCode: string
  latitude: number
  longitude: number
  /** False when the listing gives its position only roughly. */
  positionExact: boolean
  /** The asking price, empty when the home is not for sale. */
  purchasePrice: number | null
  /** The rent per month, empty when the home is not for rent. */
  rentPrice: number | null
  livingArea: number
  plotArea: number | null
  rooms: number
  bedrooms: number
  bathrooms: number
  builtYear: number
  energyLabel: EnergyLabel | null
  garden: boolean
  balcony: boolean
  parking: boolean
  description: string
  photo: string
  agentName: string
  agentPhone: string
  publishedAt: number | null
  createdAt: number
  photos: SeededPhoto[]
}

// The asking price per m² in a place's centre; the rent per month is a 230th of it.
const pricePerM2: Record<string, number> = {
  Amsterdam: 7800, Utrecht: 5600, Amstelveen: 6200, Haarlem: 5800, 'Den Haag': 4600, Leiden: 4900, Delft: 4600, Hilversum: 5000, Rotterdam: 4300,
  Madrid: 5000, Barcelona: 4800, Marbella: 5200, 'San Sebastián': 6000, Palma: 4600, 'Pozuelo de Alarcón': 4700, Sitges: 4900, Málaga: 3600,
}
const defaultPerM2 = { NL: 3900, ES: 2300 }

// The share of the listings that give their position only roughly, common on Spanish portals.
const approximatePosition = { NL: 0.05, ES: 0.3 }

// The share of the homes for sale that are let in the meantime, common in the Netherlands (leegstandswet).
const letWhileForSale = { NL: 0.12, ES: 0.04 }

const typeWeights = {
  NL: [['apartment', 40], ['house', 22], ['townhouse', 22], ['villa', 4], ['studio', 6], ['penthouse', 6]],
  ES: [['apartment', 55], ['house', 10], ['townhouse', 8], ['villa', 12], ['studio', 7], ['penthouse', 8]],
} as const

const areas: Record<PropertyType, [number, number]> = { apartment: [45, 130], house: [100, 220], townhouse: [90, 180], villa: [160, 420], studio: [22, 45], penthouse: [90, 240] }
const plots: Partial<Record<PropertyType, [number, number]>> = { house: [150, 600], townhouse: [60, 180], villa: [400, 2000] }

const labels = {
  NL: [['a_plus_2', 2], ['a_plus', 6], ['a', 25], ['b', 15], ['c', 20], ['d', 12], ['e', 9], ['f', 6], ['g', 5]],
  ES: [['a', 6], ['b', 6], ['c', 10], ['d', 18], ['e', 33], ['f', 12], ['g', 8], [null, 7]],
} as const
const newBuildLabels = [['a_plus_4', 2], ['a_plus_3', 3], ['a_plus_2', 4], ['a_plus', 4], ['a', 3]] as const

const letters = 'ABCDEGHJKLMNPRSTVWXZ'

const addressOf = (country: 'NL' | 'ES', type: PropertyType, rand: Rand) => {
  const street = pick(rand, streets[country])
  const number = int(rand, 1, 240)
  const flat = type === 'apartment' || type === 'penthouse' || type === 'studio'
  if (country === 'NL') return `${street} ${number}${flat ? `-${int(rand, 1, 4)}` : ''}`
  return `${street}, ${number}${flat ? `, ${int(rand, 1, 8)}º` : ''}`
}

const postalOf = (place: PlaceSeed, rand: Rand) =>
  place.country === 'NL' ? `${place.postal}${String(int(rand, 10, 99))} ${letters[int(rand, 0, letters.length - 1)]}${letters[int(rand, 0, letters.length - 1)]}` : `${place.postal}${String(int(rand, 0, 999)).padStart(3, '0')}`

const phoneOf = (country: 'NL' | 'ES', rand: Rand) => (country === 'NL' ? `+31 6 ${int(rand, 1000, 9999)} ${int(rand, 1000, 9999)}` : `+34 6${int(rand, 10, 99)} ${int(rand, 100, 999)} ${int(rand, 100, 999)}`)

// Listings run younger: most of the year's were published in its last months.
const ageOf = (rand: Rand) => Math.floor(365 * Math.pow(rand(), 1.6) * DAY)

const statusOf = (offer: 'sale' | 'rent', age: number, rand: Rand): SeededListing['status'] => {
  const days = age / DAY
  const roll = rand()
  if (offer === 'rent') return days > 45 && roll < 0.7 ? 'let' : days > 14 && roll < 0.8 ? 'under_offer' : 'available'
  if (days > 90) return roll < 0.65 ? 'sold' : roll < 0.8 ? 'under_offer' : 'available'
  if (days > 30) return roll < 0.1 ? 'sold' : roll < 0.4 ? 'under_offer' : 'available'
  return 'available'
}

const captions: Record<RoomKind, string> = { living: 'Living room', kitchen: 'Kitchen', bedroom: 'Bedroom', bathroom: 'Bathroom', garden: 'Garden' }

/** Listing `ordinal`, rebuilt from its ordinal alone: a home in a place picked by weight, listed by an agency there. */
export const listingAt = (places: PlaceSeed[], agenciesByPlace: Map<number, SeededAgency[]>, agenciesByCountry: Record<'NL' | 'ES', SeededAgency[]>, ordinal: number): SeededListing => {
  const rand = rngAt(401, ordinal)
  const placeIndex = weighted(rand, places.map((place, index) => [index, place.weight] as const))
  const place = places[placeIndex]!
  const country = place.country
  const agency = pick(rand, agenciesByPlace.get(placeIndex + 1) ?? agenciesByCountry[country])
  const propertyType = weighted(rand, typeWeights[country]) as PropertyType
  const offerType = rand() < (country === 'NL' ? 0.7 : 0.6) ? 'sale' : 'rent'
  const [minArea, maxArea] = areas[propertyType]
  const livingArea = int(rand, minArea, maxArea)
  const rooms = propertyType === 'studio' ? 1 : Math.max(2, Math.min(9, Math.round(livingArea / 30) + int(rand, -1, 1)))
  const plot = plots[propertyType]
  const builtYear = propertyType === 'townhouse' && rand() < 0.6 ? int(rand, 1650, 1930) : int(rand, 1930, 2025)
  const energyLabel = builtYear >= 2015 ? weighted(rand, newBuildLabels) : (weighted(rand, labels[country]) as EnergyLabel | null)
  const perM2 = (pricePerM2[place.name] ?? defaultPerM2[country]) * (0.8 + rand() * 0.45) * (propertyType === 'villa' || propertyType === 'penthouse' ? 1.2 : 1)
  // A draw of its own, so the rest of the listing is the same whether it is let in the meantime or not.
  const alsoLet = offerType === 'sale' && rngAt(405, ordinal)() < letWhileForSale[country]
  const purchasePrice = offerType === 'sale' ? Math.round((perM2 * livingArea) / 5000) * 5000 : null
  const rentPrice = offerType === 'rent' || alsoLet ? Math.round((perM2 * livingArea) / 230 / 25) * 25 : null
  const garden = plot !== undefined && rand() < 0.85
  const balcony = !garden && rand() < 0.65
  const parking = rand() < (country === 'ES' ? 0.45 : 0.25)
  const draft = rand() < 0.02
  const age = ageOf(rand)
  const publishedAt = draft ? null : seedNow - age
  const status = draft ? 'available' : statusOf(offerType, age, rand)
  const sentences = [details.transport, details.quiet, details.renovated, details.original, details.insulated].filter(() => rand() < 0.35)
  const description = [
    `${pick(rand, openings[propertyType]!)} in ${place.name}, ${livingArea} m² with ${rooms === 1 ? 'one room' : `${rooms} rooms`}.`,
    ...(garden ? [details.garden] : []),
    ...(balcony ? [details.balcony] : []),
    ...(parking ? [details.parking] : []),
    ...sentences,
  ].join(' ')
  const names = agentNames[country]
  const variant = int(rand, 0, 5)
  const shownRooms: RoomKind[] = garden ? ['living', 'kitchen', 'bedroom', 'bathroom', 'garden'] : ['living', 'kitchen', 'bedroom', 'bathroom']
  const inside = shownRooms.slice(0, int(rand, 2, 5))
  const photo = exteriorPhoto(propertyType, variant)
  return {
    id: ordinal + 1,
    agencyId: agency.id,
    placeId: placeIndex + 1,
    country,
    propertyType,
    status,
    address: addressOf(country, propertyType, rand),
    postalCode: postalOf(place, rand),
    latitude: Number((place.latitude + (rand() - 0.5) * 0.06).toFixed(6)),
    longitude: Number((place.longitude + (rand() - 0.5) * 0.09).toFixed(6)),
    positionExact: rngAt(407, ordinal)() >= approximatePosition[country],
    purchasePrice,
    rentPrice,
    livingArea,
    plotArea: plot ? int(rand, plot[0], plot[1]) : null,
    rooms,
    bedrooms: Math.max(0, rooms - 1 - (rooms > 4 && rand() < 0.5 ? 1 : 0)),
    bathrooms: 1 + (livingArea > 120 ? 1 : 0) + (propertyType === 'villa' ? 1 : 0),
    builtYear,
    energyLabel,
    garden,
    balcony,
    parking,
    description,
    photo,
    agentName: `${pick(rand, names.first)} ${pick(rand, names.last)}`,
    agentPhone: phoneOf(country, rand),
    publishedAt,
    createdAt: (publishedAt ?? seedNow) - int(rand, 1, 6) * DAY,
    photos: [{ position: 1, photo, caption: 'Outside' }, ...inside.map((kind, index) => ({ position: index + 2, photo: roomPhoto(kind, variant + index), caption: captions[kind] }))],
  }
}
