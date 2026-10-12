import { DAY, seedNow } from '../calendar'
import type { PlaceSeed } from '../data/places'
import { int, pick, rngAt, weighted } from '../rng'
import type { SeededListing } from './listing'

export type SeededUser = { id: string; name: string; email: string; role: 'admin' | 'member'; createdAt: number; demo: boolean }

export type SeededProfile = {
  id: number
  userId: string
  name: string
  offerType: 'sale' | 'rent'
  placeId: number | null
  radiusKm: number
  propertyType: string | null
  minPrice: number | null
  maxPrice: number | null
  minLivingArea: number | null
  minRooms: number | null
  minEnergyLabel: 'a' | 'b' | 'c' | null
  alertFrequency: 'instant' | 'daily'
  active: boolean
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

const profile = (fields: Partial<SeededProfile> & Pick<SeededProfile, 'id' | 'userId' | 'name' | 'offerType'>): SeededProfile => ({
  placeId: null, radiusKm: 0, propertyType: null, minPrice: null, maxPrice: null, minLivingArea: null, minRooms: null, minEnergyLabel: null,
  alertFrequency: 'daily', active: true, createdAt: seedNow - 80 * DAY, ...fields,
})

/** Anna looks to buy around Amsterdam and Haarlem, Bram to rent in Madrid or Barcelona. */
export const demoProfiles = (places: PlaceSeed[]): SeededProfile[] => [
  profile({ id: 1, userId: 'seed-anna', name: 'Around Amsterdam', offerType: 'sale', placeId: placeId(places, 'Amsterdam'), radiusKm: 20, maxPrice: 950_000, minLivingArea: 55, alertFrequency: 'instant' }),
  profile({ id: 2, userId: 'seed-anna', name: 'Family house near Haarlem', offerType: 'sale', placeId: placeId(places, 'Haarlem'), radiusKm: 15, propertyType: 'house', minRooms: 4, maxPrice: 1_200_000 }),
  profile({ id: 3, userId: 'seed-bram', name: 'Piso en Madrid', offerType: 'rent', placeId: placeId(places, 'Madrid'), radiusKm: 15, maxPrice: 3_000, minRooms: 2 }),
  profile({ id: 4, userId: 'seed-bram', name: 'Barcelona by the sea', offerType: 'rent', placeId: placeId(places, 'Barcelona'), radiusKm: 25, maxPrice: 3_500, alertFrequency: 'instant', active: false }),
]

const firstNames = ['Sanne', 'Daan', 'Lotte', 'Ruben', 'Iris', 'Jesse', 'Noor', 'Lucía', 'Javier', 'Carmen', 'Pablo', 'Elena', 'Sofía', 'Diego']
const lastNames = ['de Jong', 'Bakker', 'Visser', 'Smit', 'Meijer', 'García', 'Martínez', 'López', 'Sánchez', 'Ruiz', 'Moreno', 'Peters']

/** Member `ordinal`: an account with no password, there for the volume and for other people's rows. */
export const memberAt = (ordinal: number): SeededUser => {
  const rand = rngAt(501, ordinal)
  const number = String(ordinal + 1).padStart(5, '0')
  return { id: `seed-member-${number}`, name: `${pick(rand, firstNames)} ${pick(rand, lastNames)}`, email: `member-${number}@portal.example`, role: 'member', createdAt: seedNow - int(rand, 1, 700) * DAY, demo: false }
}

/** One to three search profiles of a generated member, around places they would look, at the prices there. */
export const profilesOf = (places: PlaceSeed[], user: SeededUser, ordinal: number, firstId: number): SeededProfile[] => {
  const rand = rngAt(502, ordinal)
  const country = rand() < 0.55 ? 'NL' : 'ES'
  const local = places.flatMap((place, index) => (place.country === country ? [[index + 1, place.weight] as const] : []))
  return Array.from({ length: int(rand, 1, 3) }, (_, index) => {
    const offerType = rand() < 0.6 ? 'sale' : 'rent'
    const typical = offerType === 'sale' ? (country === 'NL' ? 450_000 : 300_000) : country === 'NL' ? 1_800 : 1_300
    return profile({
      id: firstId + index,
      userId: user.id,
      name: `Search ${index + 1}`,
      offerType,
      placeId: rand() < 0.9 ? weighted(rand, local) : null,
      radiusKm: pick(rand, [0, 0, 0, 5, 10]),
      propertyType: rand() < 0.7 ? pick(rand, ['apartment', 'house', 'townhouse', 'villa']) : null,
      minPrice: rand() < 0.2 ? Math.round(typical * 0.5) : null,
      maxPrice: Math.round(typical * (0.7 + rand() * 0.8)),
      minLivingArea: rand() < 0.5 ? pick(rand, [40, 60, 80, 100]) : null,
      minRooms: rand() < 0.3 ? int(rand, 2, 4) : null,
      minEnergyLabel: rand() < 0.15 ? pick(rand, ['a', 'b', 'c'] as const) : null,
      alertFrequency: rand() < 0.4 ? 'instant' : 'daily',
      active: rand() < 0.9,
      createdAt: Math.max(user.createdAt, seedNow - int(rand, 5, 300) * DAY),
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
