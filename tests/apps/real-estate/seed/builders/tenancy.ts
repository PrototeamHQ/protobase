import { DAY, addMonths, lastPeriod, monthOf, windowEnd } from '../calendar'
import { firstNames, surnames } from '../data/names'
import { slugify } from '../format'
import { iban } from '../iban'
import { int, pick, rngAt, weighted } from '../rng'
import type { Org } from '../world'
import type { Tenancy } from './allocation'
import type { SeededProperty, SeededUnit } from './property'

const YEAR = 365 * DAY

/** Let when a lease covers the window's last day, else vacant, or under renovation in a long gap. */
export const unitStatus = (tenancies: Tenancy[]) => {
  const today = Math.floor(windowEnd / DAY) * DAY
  if (tenancies.some((tenancy) => tenancy.start <= today && (tenancy.end === null || tenancy.end >= today))) return 'let'
  const before = tenancies.filter((tenancy) => tenancy.start <= today).at(-1)
  return before && before.gapAfter >= 3 ? 'renovation' : 'vacant'
}

// The yearly rent increase on 1 July, in the range Dutch free-sector leases allowed.
const increases: Record<number, number> = { 2016: 0.025, 2017: 0.025, 2018: 0.03, 2019: 0.03, 2020: 0.026, 2021: 0, 2022: 0.033, 2023: 0.055, 2024: 0.055, 2025: 0.041, 2026: 0.044 }

/** The rent in cents a lease starting at `startCents` charges for `period` (a month), after every July increase since. */
export const rentAt = (startCents: number, start: number, period: number) => {
  let rent = startCents
  for (let year = new Date(start).getUTCFullYear(); year <= new Date(period).getUTCFullYear(); year++) {
    const july = Date.UTC(year, 6, 1)
    if (july > start && july <= period) rent = Math.round(rent * (1 + (increases[year] ?? 0.025)))
  }
  return rent
}

// `lease` is the organization-wide lease ordinal, `index` the lease's position among its unit's leases.
export const leaseAt = (org: Org, property: SeededProperty, unit: SeededUnit, unitOrdinal: number, index: number, tenancy: Tenancy) => {
  const lease = org.leaseStarts[unitOrdinal]! + index
  const rand = rngAt(org.seed + 8, lease)
  // New leases follow the market: the 2026 rent, about 3.5% less for every year before.
  const startCents = Math.round((unit.baseRentCents * 0.965 ** ((lastPeriod - tenancy.start) / YEAR)) / 100) * 100
  const lastMonth = tenancy.end === null ? lastPeriod : Math.min(lastPeriod, monthOf(tenancy.end))
  const serviceCents = property.kind === 'single_family' ? 0 : int(rand, 9, 24) * 500
  const signedAt = tenancy.start - int(rand, 14, 50) * DAY - int(rand, 9, 17) * 3_600_000
  const notice = tenancy.term === 'indefinite' && tenancy.end !== null ? addMonths(monthOf(tenancy.end), -int(rand, 1, 3)) + int(rand, 0, 20) * DAY : null
  return {
    id: org.leaseFirstId + lease,
    ordinal: lease,
    number: `HC-${new Date(tenancy.start).getUTCFullYear()}-${String(lease + 1).padStart(6, '0')}`,
    unitId: unit.id,
    tenancy,
    startCents,
    rentCents: rentAt(startCents, tenancy.start, lastMonth),
    serviceCents,
    notice,
    // Late payers are few: the arrears view should have something to show, not everything.
    payer: weighted(rand, [['punctual', 74], ['late', 17], ['chronic', 6], ['defaulter', 3]] as const),
    createdAt: signedAt,
    updatedAt: notice ?? signedAt,
  }
}

export type SeededLease = ReturnType<typeof leaseAt>

const providers = ['gmail.com', 'outlook.com', 'hotmail.com', 'ziggo.nl', 'kpnmail.nl', 'icloud.com', 'live.nl']

// The tenants of a lease: the primary tenant first, then a co-signer when there is one.
export const tenantsOf = (org: Org, lease: SeededLease) => {
  const first = org.tenantStarts[lease.ordinal]!
  const count = org.tenantStarts[lease.ordinal + 1]! - first
  return Array.from({ length: count }, (_, slot) => {
    const rand = rngAt(org.seed + 9, first + slot)
    const firstName = pick(rand, firstNames)
    const lastName = pick(rand, surnames)
    const age = weighted(rand, [[int(rand, 20, 29), 40], [int(rand, 30, 44), 35], [int(rand, 45, 64), 18], [int(rand, 65, 80), 7]] as const)
    return {
      id: org.tenantFirstId + first + slot,
      role: slot === 0 ? 'primary' : 'co_signer',
      firstName,
      lastName,
      email: `${slugify(firstName)}.${slugify(lastName)}${rand() < 0.4 ? int(rand, 1, 99) : ''}@${pick(rand, providers)}`,
      phone: rand() < 0.9 ? `+31 6 ${int(rand, 10_000_000, 99_999_999)}` : null,
      dateOfBirth: lease.tenancy.start - age * YEAR - int(rand, 0, 364) * DAY,
      iban: iban(rand),
      // Landlords ask for an income of about four times the rent; a co-signer adds to it.
      incomeCents: Math.round((lease.startCents * (slot === 0 ? 3 + rand() * 2.5 : 1 + rand() * 2)) / 100) * 100,
      createdAt: lease.createdAt,
    }
  })
}

/** The deposit of a lease: two months of its first rent, returned (sometimes in part) after it ends. */
export const depositFor = (org: Org, lease: SeededLease) => {
  const rand = rngAt(org.seed + 11, lease.ordinal)
  const amountCents = lease.startCents * 2
  const receivedOn = lease.createdAt + int(rand, 1, 7) * DAY
  const returnedOn = lease.tenancy.end === null ? null : lease.tenancy.end + int(rand, 14, 42) * DAY
  if (returnedOn === null || returnedOn > windowEnd) return { amountCents, receivedOn, status: 'held', returnedCents: 0, returnedOn: null }
  const status = weighted(rand, [['returned', 85], ['partially_returned', 12], ['withheld', 3]] as const)
  const returnedCents = status === 'returned' ? amountCents : status === 'withheld' ? 0 : Math.round((amountCents * (0.3 + rand() * 0.6)) / 100) * 100
  return { amountCents, receivedOn, status, returnedCents, returnedOn }
}
