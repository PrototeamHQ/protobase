import { DAY, windowStart } from '../calendar'
import { buildingNames, buildingPrefixes, firstNames, ownerCompanyWords, streets, surnames } from '../data/names'
import { iban } from '../iban'
import { int, pick, rngAt, weighted } from '../rng'
import type { Org } from '../world'
import { propertyAcquiredAt, propertyShapeAt } from './allocation'

const YEAR = 365 * DAY
const letters = 'ABCDEFGHJKLMNPRTVWXZ'

export const ownerAt = (org: Org, ordinal: number) => {
  const rand = rngAt(org.seed + 3, ordinal)
  const kind = weighted(rand, [['private', 55], ['company', 25], ['pension_fund', 8], ['housing_association', 12]] as const)
  const surname = pick(rand, surnames)
  const name =
    kind === 'private' ? `${pick(rand, firstNames)} ${surname}`
    : kind === 'company' ? `${surname.replace(/^(van|de|der|den|el)\s+/i, '').replace(/^\w/, (c) => c.toUpperCase())} ${pick(rand, ownerCompanyWords)} B.V.`
    : kind === 'pension_fund' ? `Stichting Pensioenfonds ${pick(rand, buildingNames)}`
    : `Woonstichting ${pick(rand, buildingNames)}`
  const domain = kind === 'private' ? pick(rand, ['gmail.com', 'outlook.com', 'ziggo.nl', 'kpnmail.nl']) : `${name.toLowerCase().replace(/ b\.v\.$/, '').replace(/[^a-z]+/g, '')}.nl`
  const fee = kind === 'private' ? int(rand, 700, 900) : kind === 'company' ? int(rand, 500, 650) : int(rand, 350, 500)
  return {
    id: org.ownerFirstId + ordinal,
    name,
    kind,
    email: kind === 'private' ? `${name.split(' ')[0]!.toLowerCase()}.${surname.toLowerCase().replace(/[^a-z]+/g, '')}@${domain}` : `beheer@${domain}`,
    phone: rand() < 0.8 ? `+31 ${int(rand, 10, 79)} ${int(rand, 1_000_000, 9_999_999)}` : null,
    iban: iban(rand),
    feePercent: fee / 100,
    createdAt: Math.floor(windowStart - int(rand, 1, 9) * YEAR),
  }
}

const builtYear = (rand: () => number) =>
  weighted(rand, [[int(rand, 1890, 1940), 25], [int(rand, 1946, 1979), 30], [int(rand, 1980, 2005), 30], [int(rand, 2006, 2024), 15]] as const)

export const propertyAt = (org: Org, ordinal: number) => {
  const { kind, units } = propertyShapeAt(org.seed, ordinal)
  const rand = rngAt(org.seed + 4, ordinal)
  const [city, lat, lng, postalFrom, postalTo, rentPerM2] = weighted(rand, org.cities.map((entry, index) => [entry, index === 0 ? 40 : 12] as const))
  const street = pick(rand, streets)
  const number = int(rand, 1, 240)
  const houseNumber = kind === 'single_family' && rand() < 0.1 ? `${number}${pick(rand, ['a', 'b'])}` : String(number)
  const building = `${pick(rand, buildingPrefixes)} ${pick(rand, buildingNames)}`
  return {
    id: org.propertyFirstId + ordinal,
    ownerId: org.ownerFirstId + Math.floor(rand() ** 1.7 * org.ownerCount),
    kind,
    units,
    name: kind === 'single_family' ? `${street} ${houseNumber}` : building,
    shortName: kind === 'single_family' ? `${street} ${houseNumber}` : building.split(' ').slice(1).join(' '),
    street,
    houseNumber,
    postalCode: `${int(rand, postalFrom, postalTo)} ${pick(rand, [...letters])}${pick(rand, [...letters])}`,
    city,
    latitude: (lat + (rand() - 0.5) * 0.06).toFixed(6),
    longitude: (lng + (rand() - 0.5) * 0.09).toFixed(6),
    rentPerM2,
    builtYear: builtYear(rand),
    createdAt: propertyAcquiredAt(org.seed, ordinal),
  }
}

export type SeededProperty = ReturnType<typeof propertyAt>

const energyLabels = ['A++++', 'A+++', 'A++', 'A+', 'A', 'B', 'C', 'D', 'E', 'F', 'G'] as const

// Newer buildings and renovated older ones carry better labels.
const energyLabel = (builtYear: number, rand: () => number) => {
  const base = builtYear >= 2015 ? 2 : builtYear >= 2000 ? 4 : builtYear >= 1980 ? 6 : 7
  return energyLabels[Math.max(0, Math.min(energyLabels.length - 1, base + int(rand, -2, 2)))]!
}

// The unit's slot inside its property; `unit` is the organization-wide unit ordinal.
export const unitAt = (org: Org, property: SeededProperty, unit: number) => {
  const slot = unit - org.unitStarts[property.id - org.propertyFirstId]!
  const rand = rngAt(org.seed + 5, unit)
  const perFloor = property.kind === 'mixed_use' ? 3 : 4
  // Mixed-use blocks have shops on the ground floor, so their homes start on the first.
  const floor = property.kind === 'single_family' ? 0 : Math.floor(slot / perFloor) + (property.kind === 'mixed_use' ? 1 : 0)
  const area = property.kind === 'single_family' ? int(rand, 85, 165) : int(rand, 38, 115)
  const bedrooms = area < 45 ? int(rand, 0, 1) : area < 70 ? 2 : area < 100 ? 3 : 4
  const marketFactor = 0.9 + rand() * 0.25
  return {
    id: org.unitFirstId + unit,
    label: property.kind === 'single_family' ? property.shortName : `${property.shortName} ${floor}.${String((slot % perFloor) + 1).padStart(2, '0')}`,
    floor,
    bedrooms,
    area,
    energyLabel: energyLabel(property.builtYear, rand),
    // 2026 market rent, in whole euros.
    baseRentCents: Math.round(area * property.rentPerM2 * marketFactor * (property.kind === 'single_family' ? 0.92 : 1)) * 100,
    topFloor: property.kind !== 'single_family' && slot >= property.units - perFloor,
    createdAt: property.createdAt,
  }
}

export type SeededUnit = ReturnType<typeof unitAt>
