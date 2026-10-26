import { DAY, seedNow } from '../calendar'
import type { PlaceSeed } from '../data/places'
import { int, pick, rngAt, weighted } from '../rng'
import { distanceKm } from './distance'
import type { SeededListing } from './listing'
import { searchFilter, type SearchCriteria } from './search-filter'

export type SeededUser = { id: string; name: string; email: string; role: 'admin' | 'member'; createdAt: number; demo: boolean }

/** A saved search: its filter as the listings page would have saved it, and the criteria it was printed from. */
export type SeededSearch = {
  id: number
  userId: string
  name: string
  criteria: SearchCriteria
  filter: string
  alertFrequency: 'instant' | 'daily' | 'none'
  /** When the member last opened its results: the listings published since are new to them. */
  seenAt: number
  createdAt: number
}

/** The accounts to sign in with, all with the demo password; their ids mark them as the seed's own. */
export const demoUsers: SeededUser[] = [
  { id: 'seed-admin', name: 'Portal admin', email: 'admin@portal.example', role: 'admin', createdAt: seedNow - 400 * DAY, demo: true },
  { id: 'seed-anna', name: 'Anna de Vries', email: 'anna@portal.example', role: 'member', createdAt: seedNow - 120 * DAY, demo: true },
  { id: 'seed-bram', name: 'Bram Jansen', email: 'bram@portal.example', role: 'member', createdAt: seedNow - 90 * DAY, demo: true },
]

export const demoPassword = 'property-portal-demo'

const placeId = (places: PlaceSeed[], name: string) => places.findIndex((place) => place.name === name) + 1

// The places a search of `name` takes in: it and those within `radiusKm` of its centre, as a member ticks them.
const around = (places: PlaceSeed[], name: string, radiusKm: number) => {
  const centre = places[placeId(places, name) - 1]!
  return places.flatMap((place, index) => (place === centre || distanceKm(centre, place) <= radiusKm ? [index + 1] : []))
}

const anything: SearchCriteria = { forSale: false, forRent: false, placeIds: [], propertyType: null, energyLabels: [], purchasePrice: null, rentPrice: null, livingArea: null, bedrooms: null, garden: false }

type SearchFields = Pick<SeededSearch, 'id' | 'userId' | 'name'> & Partial<Pick<SeededSearch, 'alertFrequency' | 'seenAt' | 'createdAt'>> & { criteria: Partial<SearchCriteria> }

const search = ({ criteria, ...fields }: SearchFields): SeededSearch => {
  const full = { ...anything, ...criteria }
  return { alertFrequency: 'daily', createdAt: seedNow - 80 * DAY, seenAt: seedNow - 3 * DAY, ...fields, criteria: full, filter: searchFilter(full) }
}

/** Anna looks to buy around Amsterdam, or to buy or rent a house near Haarlem; Bram to rent in Madrid or Barcelona. */
export const demoSearches = (places: PlaceSeed[]): SeededSearch[] => [
  search({ id: 1, userId: 'seed-anna', name: 'Around Amsterdam', alertFrequency: 'instant', seenAt: seedNow - 21 * DAY, criteria: { forSale: true, placeIds: around(places, 'Amsterdam', 20), purchasePrice: [250_000, 950_000], livingArea: [55, 250] } }),
  search({ id: 2, userId: 'seed-anna', name: 'Family house near Haarlem', seenAt: seedNow - 30 * DAY, criteria: { forSale: true, forRent: true, placeIds: around(places, 'Haarlem', 15), propertyType: 'house', bedrooms: [3, 6] } }),
  search({ id: 3, userId: 'seed-bram', name: 'Piso en Madrid', seenAt: seedNow - 14 * DAY, criteria: { forRent: true, placeIds: around(places, 'Madrid', 15), rentPrice: [800, 3_000], bedrooms: [1, 4] } }),
  search({ id: 4, userId: 'seed-bram', name: 'Barcelona by the sea', alertFrequency: 'none', seenAt: seedNow - 30 * DAY, criteria: { forRent: true, placeIds: around(places, 'Barcelona', 25), rentPrice: [900, 3_500] } }),
]

const typicalPrice = { sale: { NL: 450_000, ES: 300_000 }, rent: { NL: 1_800, ES: 1_300 } }

// The share of generated profiles looking both ways, with a range for each: a draw of their own.
const lookingBothWays = 0.1

const firstNames = ['Sanne', 'Daan', 'Lotte', 'Ruben', 'Iris', 'Jesse', 'Noor', 'Lucía', 'Javier', 'Carmen', 'Pablo', 'Elena', 'Sofía', 'Diego']
const lastNames = ['de Jong', 'Bakker', 'Visser', 'Smit', 'Meijer', 'García', 'Martínez', 'López', 'Sánchez', 'Ruiz', 'Moreno', 'Peters']

/** Member `ordinal`: an account with no password, there for the volume and for other people's rows. */
export const memberAt = (ordinal: number): SeededUser => {
  const rand = rngAt(501, ordinal)
  const number = String(ordinal + 1).padStart(5, '0')
  return { id: `seed-member-${number}`, name: `${pick(rand, firstNames)} ${pick(rand, lastNames)}`, email: `member-${number}@portal.example`, role: 'member', createdAt: seedNow - int(rand, 1, 700) * DAY, demo: false }
}

/** One to three saved searches of a generated member, in places they would look, at the prices there. */
export const searchesOf = (places: PlaceSeed[], user: SeededUser, ordinal: number, firstId: number): SeededSearch[] => {
  const rand = rngAt(502, ordinal)
  const country = rand() < 0.55 ? 'NL' : 'ES'
  const local = places.flatMap((place, index) => (place.country === country ? [[index + 1, place.weight] as const] : []))
  return Array.from({ length: int(rand, 1, 3) }, (_, index) => {
    const offerType = rand() < 0.6 ? 'sale' : 'rent'
    const both = rngAt(505, firstId + index)() < lookingBothWays
    const typical = typicalPrice[offerType][country]
    const placeId = rand() < 0.9 ? weighted(rand, local) : null
    const propertyType = rand() < 0.7 ? pick(rand, ['apartment', 'house', 'townhouse', 'villa']) : null
    const share = 0.7 + rand() * 0.8
    const price: [number, number] = [rand() < 0.2 ? Math.round(typical * 0.5) : 0, Math.round(typical * share)]
    const minArea = rand() < 0.5 ? pick(rand, [40, 60, 80, 100]) : null
    const minBedrooms = rand() < 0.3 ? int(rand, 1, 3) : null
    const createdAt = Math.max(user.createdAt, seedNow - int(rand, 5, 300) * DAY)
    const place = placeId === null ? undefined : places[placeId - 1]!
    return search({
      id: firstId + index,
      userId: user.id,
      name: `${place?.name ?? 'Anywhere'}, ${offerType === 'sale' ? 'to buy' : 'to rent'}`,
      alertFrequency: rand() < 0.4 ? 'instant' : rand() < 0.9 ? 'daily' : 'none',
      createdAt,
      seenAt: Math.max(createdAt, seedNow - int(rand, 0, 20) * DAY),
      criteria: {
        // Both ways, a home fits by the flags alone: a price range keeps out the homes not offered that way.
        forSale: offerType === 'sale' || both,
        forRent: offerType === 'rent' || both,
        placeIds: placeId === null ? [] : [placeId],
        propertyType,
        purchasePrice: offerType === 'sale' && !both ? price : null,
        rentPrice: offerType === 'rent' && !both ? price : null,
        livingArea: minArea === null ? null : [minArea, 400],
        bedrooms: minBedrooms === null ? null : [minBedrooms, 8],
        energyLabels: rand() < 0.15 ? ['a_plus_2', 'a_plus', 'a', 'b'].slice(0, int(rand, 2, 4)) : [],
      },
    })
  })
}

const noteTexts = [
  'Viewing booked for Saturday at 11:00.',
  'Ask the agent about the service charges and the reserve fund.',
  'Lovely garden, but a long way from the station.',
  'Compare with the one two streets further on.',
  'The kitchen needs work: count on about €15,000.',
  'Bid at most €10,000 over the asking price.',
  'Noisy street at rush hour; go back in the evening.',
  'Light all day. The second bedroom is small.',
  'Check the energy label paperwork before bidding.',
  'Agent said there are already three viewings planned.',
]

/** A member's favorites among the published listings where they look, and the notes they wrote on some of them. */
export const savedBy = (user: SeededUser, ordinal: number, candidates: SeededListing[], count: number) => {
  const rand = rngAt(503, ordinal)
  const chosen = new Map<number, SeededListing>()
  for (let tries = 0; tries < count * 3 && chosen.size < count && candidates.length > 0; tries++) {
    const listing = pick(rand, candidates)
    chosen.set(listing.id, listing)
  }
  const favorites = [...chosen.values()].map((listing) => ({ listing, createdAt: Math.min(seedNow, Math.max(user.createdAt, listing.publishedAt!) + int(rand, 1, 10) * DAY) }))
  const notes = favorites.filter(() => rand() < 0.5).map(({ listing, createdAt }) => ({ listing, body: pick(rand, noteTexts), createdAt: Math.min(seedNow, createdAt + int(rand, 0, 3) * DAY) }))
  return { favorites, notes }
}
