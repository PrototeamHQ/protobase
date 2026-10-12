import { agencyNames } from '../data/names'
import type { PlaceSeed } from '../data/places'
import { slugify } from '../format'
import { int, pick, rngAt, weighted } from '../rng'

export type SeededAgency = { id: number; name: string; placeId: number; country: 'NL' | 'ES'; phone: string; email: string; website: string }

const phone = (country: 'NL' | 'ES', rand: () => number) =>
  country === 'NL' ? `+31 ${int(rand, 10, 79)} ${int(rand, 100, 999)} ${int(rand, 1000, 9999)}` : `+34 9${int(rand, 10, 99)} ${int(rand, 100, 999)} ${int(rand, 100, 999)}`

/** Agency `ordinal`, its office in a place picked by how many listings the place draws. */
export const agencyAt = (places: PlaceSeed[], ordinal: number): SeededAgency => {
  const rand = rngAt(301, ordinal)
  const placeIndex = weighted(rand, places.map((place, index) => [index, place.weight] as const))
  const place = places[placeIndex]!
  const parts = agencyNames[place.country]
  const base = place.country === 'NL' ? `${pick(rand, parts.first)} ${pick(rand, parts.second)}` : `${pick(rand, parts.first)} ${pick(rand, parts.second)}`
  // Names repeat across places; the place keeps them apart, and the ordinal keeps their sites apart.
  const name = `${base} ${place.name}`
  const domain = `${slugify(base)}-${ordinal + 1}.${place.country === 'NL' ? 'nl' : 'es'}`
  return { id: ordinal + 1, name, placeId: placeIndex + 1, country: place.country, phone: phone(place.country, rand), email: `info@${domain}`, website: `https://www.${domain}` }
}
