import { DAY, windowEnd, within } from '../calendar'
import { pick, rngAt } from '../rng'
import type { Org } from '../world'
import type { SeededOrder } from './order'

const vatRates = { NL: 21, DE: 19, GB: 20 } as const

// Shipped and delivered orders are invoiced; the invoice id follows the order ordinal.
export const invoiceFor = (org: Org, ordinal: number, order: SeededOrder) => {
  if (order.status !== 'shipped' && order.status !== 'delivered') return null
  const rand = rngAt(org.seed + 9, ordinal)
  const issuedAt = within(order.createdAt, (1 + Math.floor(rand() * 3)) * DAY, rand)
  const dueAt = issuedAt + pick(rand, [14, 30, 30, 30, 60]) * DAY
  const vatRate = vatRates[order.company.country]
  const subtotalCents = order.totalCents
  const vatCents = Math.round((subtotalCents * vatRate) / 100)
  const recent = windowEnd - issuedAt < 2 * DAY
  return {
    id: org.orderFirstId + ordinal + 1,
    number: `INV-${new Date(issuedAt).getUTCFullYear()}-${String(ordinal + 1).padStart(6, '0')}`,
    status: order.paid ? 'paid' : dueAt < windowEnd ? 'overdue' : recent && rand() < 0.5 ? 'draft' : 'sent',
    issuedAt,
    dueAt,
    vatRate,
    subtotalCents,
    vatCents,
    totalCents: subtotalCents + vatCents,
    createdAt: issuedAt,
    updatedAt: within(issuedAt, Math.floor(rand() * 20 * DAY), rand),
  }
}
