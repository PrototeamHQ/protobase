import type { Db } from '../../db/connection'
import { ownerAt, propertyAt, unitAt, type SeededProperty, type SeededUnit } from '../builders/property'
import { tenanciesOf } from '../builders/allocation'
import { unitStatus } from '../builders/tenancy'
import { DAY, windowEnd } from '../calendar'
import { copyRows } from '../copy'
import type { AmenityCode } from '../data/reference'
import { iso, isoDate, money, row } from '../format'
import { int, rngAt } from '../rng'
import type { Org, World } from '../world'

function* ownerRows(world: World) {
  for (const org of world.orgs) {
    for (let ordinal = 0; ordinal < org.ownerCount; ordinal++) {
      const owner = ownerAt(org, ordinal)
      yield row(owner.id, org.id, owner.name, owner.kind, owner.email, owner.phone, owner.iban, owner.feePercent.toFixed(2), iso(owner.createdAt), iso(owner.createdAt))
    }
  }
}

function* propertyRows(world: World) {
  for (const org of world.orgs) {
    for (let ordinal = 0; ordinal < org.propertyCount; ordinal++) {
      const p = propertyAt(org, ordinal)
      yield row(p.id, org.id, p.ownerId, p.name, p.kind, p.street, p.houseNumber, p.postalCode, p.city, p.latitude, p.longitude, p.builtYear, iso(p.createdAt), iso(p.createdAt))
    }
  }
}

// Every unit with its property, in unit order.
export function* unitsOf(org: Org): Generator<{ property: SeededProperty; unit: SeededUnit; ordinal: number }> {
  for (let p = 0; p < org.propertyCount; p++) {
    const property = propertyAt(org, p)
    for (let ordinal = org.unitStarts[p]!; ordinal < org.unitStarts[p + 1]!; ordinal++) yield { property, unit: unitAt(org, property, ordinal), ordinal }
  }
}

function* unitRows(world: World) {
  for (const org of world.orgs) {
    for (const { property, unit, ordinal } of unitsOf(org)) {
      const status = unitStatus(tenanciesOf(org.seed, ordinal, property.createdAt))
      yield row(unit.id, org.id, property.id, unit.label, unit.floor, unit.bedrooms, unit.area, unit.energyLabel, money(unit.baseRentCents), status, iso(unit.createdAt), iso(unit.createdAt))
    }
  }
}

// Amenities by kind of home, with how often a unit has each.
const houseAmenities: Array<[AmenityCode, number]> = [['garden', 0.85], ['parking', 0.4], ['storage_room', 0.3], ['solar_panels', 0.35], ['heat_pump', 0.15], ['furnished', 0.03]]
const flatAmenities: Array<[AmenityCode, number]> = [['balcony', 0.6], ['bike_storage', 0.5], ['storage_room', 0.35], ['parking', 0.2], ['solar_panels', 0.1], ['heat_pump', 0.08], ['furnished', 0.08]]

function* unitAmenityRows(world: World) {
  for (const org of world.orgs) {
    for (const { property, unit, ordinal } of unitsOf(org)) {
      const rand = rngAt(org.seed + 14, ordinal)
      const codes = (property.kind === 'single_family' ? houseAmenities : flatAmenities).filter(([, chance]) => rand() < chance).map(([code]) => code)
      if (property.kind !== 'single_family' && property.units > 12) codes.push('lift')
      if (unit.topFloor && rand() < 0.25) codes.push('roof_terrace')
      for (const code of codes) yield row(unit.id, code, org.id, iso(unit.createdAt))
    }
  }
}

// Market value per m2 from the rent per m2, and how prices moved year on year.
const valueYears = [[2023, 0.93], [2024, 0.96], [2025, 1.0], [2026, 1.06]] as const

function* valuationRows(world: World) {
  let id = 1
  for (const org of world.orgs) {
    for (let ordinal = 0; ordinal < org.propertyCount; ordinal++) {
      const property = propertyAt(org, ordinal)
      let area = 0
      for (let unit = org.unitStarts[ordinal]!; unit < org.unitStarts[ordinal + 1]!; unit++) area += unitAt(org, property, unit).area
      const rand = rngAt(org.seed + 15, ordinal)
      const perM2 = property.rentPerM2 * 210 * (0.85 + rand() * 0.3)
      for (const [year, factor] of valueYears) {
        const valuedOn = Date.UTC(year, 0, 1)
        if (valuedOn < property.createdAt) continue
        const value = Math.round((area * perM2 * factor) / 1000) * 1000
        yield row(id++, org.id, property.id, isoDate(valuedOn), money(value * 100), 'woz', iso(valuedOn + 40 * DAY), iso(valuedOn + 40 * DAY))
      }
      if (rand() < 0.12) {
        const valuedOn = Math.floor((property.createdAt + rand() * (windowEnd - property.createdAt)) / DAY) * DAY
        const value = Math.round((area * perM2 * (1.05 + rand() * 0.2)) / 1000) * 1000
        const recordedAt = Math.min(valuedOn + int(rand, 3, 20) * DAY, windowEnd)
        yield row(id++, org.id, property.id, isoDate(valuedOn), money(value * 100), 'appraisal', iso(recordedAt), iso(recordedAt))
      }
    }
  }
}

export const seedPortfolio = async (sql: Db, world: World) => {
  await copyRows(sql, 'portfolio.owners (id, organization_id, name, kind, email, phone, iban, management_fee_percent, created_at, updated_at)', ownerRows(world))
  await copyRows(sql, 'portfolio.properties (id, organization_id, owner_id, name, kind, street, house_number, postal_code, city, latitude, longitude, built_year, created_at, updated_at)', propertyRows(world))
  await copyRows(sql, 'portfolio.units (id, organization_id, property_id, label, floor, bedrooms, area_m2, energy_label, base_rent, status, created_at, updated_at)', unitRows(world))
  await copyRows(sql, 'portfolio.unit_amenities (unit_id, amenity_code, organization_id, added_at)', unitAmenityRows(world))
  await copyRows(sql, 'portfolio.valuations (id, organization_id, property_id, valued_on, value, source, created_at, updated_at)', valuationRows(world))
}
