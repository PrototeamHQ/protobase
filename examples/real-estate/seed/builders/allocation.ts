import { DAY, addMonths, firstPeriod, monthOf, windowEnd, windowStart } from '../calendar'
import { int, pick, rngAt, weighted } from '../rng'

// What the ids of everything under a property depend on: world.ts counts units, leases and tenants with these before
// any row is built, so they take only the organization's seed and an ordinal.

const YEAR = 365 * DAY

export const propertyShapeAt = (seed: number, ordinal: number) => {
  const rand = rngAt(seed + 1, ordinal)
  const kind = weighted(rand, [['single_family', 45], ['apartment_building', 40], ['mixed_use', 15]] as const)
  const units = kind === 'single_family' ? 1 : kind === 'mixed_use' ? int(rand, 2, 12) : int(rand, 6, 40)
  return { kind, units }
}

// Most of the portfolio was under management before the window; about one property in eight joined during it.
export const propertyAcquiredAt = (seed: number, ordinal: number) => {
  const rand = rngAt(seed + 2, ordinal)
  if (rand() < 0.88) return Math.floor(windowStart - rand() * 8 * YEAR)
  return Math.floor(windowStart + rand() * (windowEnd - windowStart - 120 * DAY))
}

export type Tenancy = { start: number; end: number | null; term: 'fixed' | 'indefinite'; gapAfter: number }

// The leases of one unit, oldest first, as months: each starts on a first and ends on a last day of a month, and the
// next starts after a few empty months at most (the longer gaps are renovations). Only leases that reach into the
// window are kept. An indefinite lease that runs past the window has no end date yet; a fixed one always has one.
// `unit` is the organization-wide unit ordinal.
export const tenanciesOf = (seed: number, unit: number, availableFrom: number) => {
  const rand = rngAt(seed + 6, unit)
  const tenancies: Tenancy[] = []
  let start = availableFrom < windowStart ? addMonths(firstPeriod, -int(rand, 1, 96)) : addMonths(monthOf(availableFrom), int(rand, 1, 3))
  while (start <= windowEnd) {
    const term = rand() < 0.35 ? 'fixed' : 'indefinite'
    const months = term === 'fixed' ? pick(rand, [12, 24]) : weighted(rand, [[int(rand, 12, 36), 35], [int(rand, 37, 96), 45], [int(rand, 97, 240), 20]] as const)
    const next = addMonths(start, months)
    const lastDay = next - DAY
    const end = term === 'fixed' || lastDay <= windowEnd ? lastDay : null
    const gapAfter = weighted(rand, [[0, 55], [1, 25], [2, 12], [int(rand, 3, 5), 8]] as const)
    if (lastDay >= windowStart) tenancies.push({ start, end, term, gapAfter })
    start = addMonths(next, gapAfter)
  }
  return tenancies
}

export const coSigned = (seed: number, lease: number) => rngAt(seed + 7, lease)() < 0.3

