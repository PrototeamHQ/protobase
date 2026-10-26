import { DAY, windowStart } from '../calendar'
import { int, pick, rngAt } from '../rng'
import type { Org } from '../world'
import { bases } from './categories'

const qualifiers = ['', 'Pro', 'Eco', 'Heavy duty', 'Food grade', 'Marine', 'Low profile', 'Extended', 'Compact', 'Industrial', 'Standard', 'Premium', 'Trade pack', 'Bulk', 'Value', 'Light', 'Reinforced', 'EU spec', 'UK spec', 'Retrofit']
const materials = ['steel', 'stainless steel', 'zinc plated steel', 'aluminium', 'nylon', 'rubber', 'polyethylene', 'cardboard', 'brass']
const origins = ['NL', 'DE', 'PL', 'IT', 'CN', 'TR']

const variantOf = (ordinal: number) => Math.floor(ordinal / bases.length) % qualifiers.length

export const productName = (ordinal: number) => {
  const qualifier = qualifiers[variantOf(ordinal)]!
  const round = Math.floor(ordinal / (bases.length * qualifiers.length))
  const name = qualifier ? `${bases[ordinal % bases.length]!.name} - ${qualifier}` : bases[ordinal % bases.length]!.name
  return round > 0 ? `${name} (series ${round + 1})` : name
}

// Rounded to 5 cents; later qualifiers cost a little more.
export const productPriceCents = (ordinal: number) =>
  Math.round((bases[ordinal % bases.length]!.price * (1 + variantOf(ordinal) * 0.045)) / 5) * 5

export const productAt = (org: Org, ordinal: number) => {
  const rand = rngAt(org.seed + 2, ordinal)
  const base = bases[ordinal % bases.length]!
  const name = productName(ordinal)
  const createdAt = windowStart - 30 * DAY - Math.floor((1 - ordinal / org.productCount) * 3 * 365 * DAY)
  const deleted = ordinal % 37 === 36
  return {
    id: org.productFirstId + ordinal,
    categoryId: org.categoryFirstId + base.category,
    sku: `${base.code}-${String(ordinal + 1).padStart(5, '0')}`,
    name,
    description: rand() < 0.4 ? null : `${name}. Stocked for industrial maintenance and assembly.`,
    priceCents: productPriceCents(ordinal),
    attributes: {
      material: pick(rand, materials),
      weight_g: int(rand, 5, 8000),
      pack_size: pick(rand, [1, 10, 25, 50, 100, 250]),
      origin: pick(rand, origins),
      hazardous: rand() < 0.04,
    },
    deletedAt: deleted ? createdAt + int(rand, 30, 900) * DAY : null,
    createdAt,
  }
}
