import { DAY, windowEnd, windowStart, within, yearOf } from '../calendar'
import { int, pick, rngAt, weighted } from '../rng'
import type { Org } from '../world'
import { companyAt, legacyCompanies, peopleOf } from './company'
import { productName, productPriceCents } from './product'

const notes = ['Deliver before 10:00', 'Call on arrival', 'Partial delivery accepted', 'Customer pickup', 'Include delivery note in box', 'Urgent, production stopped']

const statusFor = (ageDays: number, rand: () => number) => {
  if (ageDays < 2) return pick(rand, ['draft', 'confirmed', 'confirmed', 'picking'] as const)
  if (ageDays < 10) return weighted(rand, [['confirmed', 20], ['picking', 25], ['shipped', 35], ['delivered', 20]] as const)
  return weighted(rand, [['delivered', 88], ['shipped', 3], ['cancelled', 7], ['picking', 1], ['confirmed', 1]] as const)
}

const hex = (value: number, width: number) => value.toString(16).padStart(width, '0')

const uuidv7 = (ms: number, rand: () => number) => {
  const time = hex(ms, 12)
  const tail = hex(int(rand, 0, 0xffffffff), 8) + hex(int(rand, 0, 0xffff), 4)
  return `${time.slice(0, 8)}-${time.slice(8)}-7${hex(int(rand, 0, 0xfff), 3)}-${hex(0x8000 + int(rand, 0, 0x3fff), 4)}-${tail}`
}

// A whole order, rebuilt from its ordinal alone. The order, line, invoice and
// invoice line seeds each call this, so no pass has to keep the others in memory.
export const orderAt = (org: Org, ordinal: number) => {
  const rand = rngAt(org.seed + 7, ordinal)
  const createdAt = org.orderTimes[ordinal]!
  const progress = (createdAt - windowStart) / (windowEnd - windowStart)
  const legacy = legacyCompanies(org)
  const available = Math.max(1, legacy + Math.floor((org.companyCount - legacy) * progress))
  const companyOrdinal = Math.floor(rand() ** 2 * available)
  const company = companyAt(org, companyOrdinal)
  const people = peopleOf(org, companyOrdinal)
  const personId = rand() < 0.85 ? org.personFirstId + org.personStarts[companyOrdinal]! + int(rand, 0, people - 1) : null
  const status = statusFor((windowEnd - createdAt) / DAY, rand)
  const discount = weighted(rand, [[0, 55], [5, 20], [10, 15], [15, 10]] as const)
  const lineCount = weighted(rand, [[1, 10], [2, 15], [3, 22], [4, 20], [5, 14], [6, 10], [7, 5], [8, 4]] as const)
  const lines = Array.from({ length: lineCount }, (_, index) => {
    const productOrdinal = Math.floor(rand() ** 1.6 * org.productCount)
    return {
      lineNo: index + 1,
      productId: org.productFirstId + productOrdinal,
      description: productName(productOrdinal),
      quantity: weighted(rand, [[int(rand, 1, 5), 50], [int(rand, 6, 20), 35], [int(rand, 21, 60), 15]] as const),
      unitPriceCents: Math.round((productPriceCents(productOrdinal) * (100 - discount)) / 100),
    }
  })
  const paid = status === 'delivered' ? rand() < 0.88 : status === 'shipped' ? rand() < 0.3 : false
  return {
    id: uuidv7(createdAt, rand),
    number: `SO-${yearOf(createdAt)}-${String(ordinal + 1).padStart(6, '0')}`,
    company,
    personId,
    ownerId: pick(rand, org.salesUsers).id,
    status,
    discount,
    totalCents: lines.reduce((sum, line) => sum + line.quantity * line.unitPriceCents, 0),
    paid,
    notes: rand() < 0.08 ? pick(rand, notes) : null,
    createdAt,
    updatedAt: within(createdAt, Math.floor(rand() * (status === 'draft' ? 0.1 : 8) * DAY), rand),
    lines,
  }
}

export type SeededOrder = ReturnType<typeof orderAt>
