import { customerAt } from './customers'
import { int, mockNow, pick, rngAt, weighted } from './rng'
import { productAt, productCount } from './products'

export const invoiceStatuses = ['draft', 'sent', 'paid', 'overdue'] as const

export type InvoiceLine = { id: string; productId: string; description: string; quantity: number; unitPriceCents: number }

export const lineTotalCents = (line: Pick<InvoiceLine, 'quantity' | 'unitPriceCents'>) => line.quantity * line.unitPriceCents

export const invoiceTotals = (lines: InvoiceLine[], vatRate = 0.21) => {
  const subtotalCents = lines.reduce((sum, line) => sum + lineTotalCents(line), 0)
  const vatCents = Math.round(subtotalCents * vatRate)
  return { subtotalCents, vatCents, totalCents: subtotalCents + vatCents }
}

export const invoiceAt = (index: number) => {
  const rand = rngAt(53, index)
  const number = 4218 - index
  const lines: InvoiceLine[] = Array.from({ length: int(rand, 3, 5) }, (_, lineIndex) => {
    const product = productAt(int(rand, 0, productCount - 1))
    return { id: `l${number}-${lineIndex}`, productId: product.id, description: product.name, quantity: int(rand, 2, 60), unitPriceCents: product.priceCents }
  })
  const issuedAt = mockNow - index * 86_400_000 * 0.9 - 86_400_000
  return {
    id: `i${number}`,
    number: `INV-2026-${String(number).padStart(5, '0')}`,
    customer: customerAt(int(rand, 0, 479)),
    status: weighted(rand, [['paid', 55], ['sent', 25], ['overdue', 12], ['draft', 8]] as const),
    issuedAt,
    dueAt: issuedAt + 30 * 86_400_000,
    currency: 'EUR',
    paymentTerms: pick(rand, ['Net 30', 'Net 14', 'Net 30']),
    lines,
  }
}

export type Invoice = ReturnType<typeof invoiceAt>
