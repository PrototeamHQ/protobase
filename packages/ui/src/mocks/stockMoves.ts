import { int, mockNow, pick, rngAt, weighted } from './rng'
import { productAt } from './products'
import { users } from './users'

export const stockMoveCount = 10_240_000
export const warehouses = ['AMS-01', 'RTM-02', 'DUS-01', 'ANT-03'] as const
export const moveKinds = ['receipt', 'issue', 'transfer', 'adjustment'] as const
export type MoveKind = (typeof moveKinds)[number]

const spanMs = 3 * 365 * 86_400_000
const stepMs = Math.floor(spanMs / stockMoveCount)

export const stockMoveAt = (index: number) => {
  const rand = rngAt(37, index)
  const kind = weighted(rand, [['issue', 55], ['receipt', 28], ['transfer', 13], ['adjustment', 4]] as const)
  const size = int(rand, 1, kind === 'receipt' ? 240 : 40)
  const product = productAt(int(rand, 0, 999))
  const quantity = kind === 'issue' ? -size : kind === 'adjustment' ? (rand() > 0.5 ? 1 : -1) * int(rand, 1, 6) : size
  const reference = kind === 'receipt' ? `PO-${int(rand, 10000, 19999)}` : kind === 'issue' ? `SO-2026-${String(int(rand, 1, 48213)).padStart(6, '0')}` : `TR-${int(rand, 1000, 9999)}`
  return {
    id: String(index + 1),
    movedAt: mockNow - spanMs + index * stepMs + int(rand, 0, stepMs - 1),
    kind,
    product: { id: product.id, name: product.name },
    sku: product.sku,
    warehouse: pick(rand, warehouses),
    quantity,
    unitCostCents: Math.round(product.priceCents * 0.62),
    reference,
    user: pick(rand, users).id,
  }
}

export type StockMove = ReturnType<typeof stockMoveAt>
