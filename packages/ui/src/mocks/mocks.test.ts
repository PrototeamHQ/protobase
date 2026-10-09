import { describe, expect, it } from 'vitest'
import { activitySeries, invoiceAt, invoiceTotals, orderAt, orderCount, productAt, stockMoveAt, stockMoveCount } from './index'

describe('generators', () => {
  it('are deterministic per index', () => {
    expect(orderAt(1234)).toEqual(orderAt(1234))
    expect(stockMoveAt(9_999_999)).toEqual(stockMoveAt(9_999_999))
    expect(invoiceAt(3)).toEqual(invoiceAt(3))
  })
  it('vary between indexes', () => {
    expect(orderAt(1).customer.name === orderAt(2).customer.name && orderAt(1).totalCents === orderAt(2).totalCents).toBe(false)
  })
})

describe('orders', () => {
  it('number newest first with decreasing time', () => {
    expect(orderAt(0).number).toBe(`SO-2026-0${orderCount}`)
    expect(orderAt(10).createdAt).toBeGreaterThan(orderAt(11).createdAt)
  })
  it('keep totals positive', () => {
    for (let i = 0; i < 500; i++) expect(orderAt(i).totalCents).toBeGreaterThan(0)
  })
})

describe('stock moves', () => {
  it('increase in time with index across 10M rows', () => {
    expect(stockMoveAt(stockMoveCount - 1).movedAt).toBeGreaterThan(stockMoveAt(5_000_000).movedAt)
    expect(stockMoveAt(5_000_000).movedAt).toBeGreaterThan(stockMoveAt(0).movedAt)
  })
  it('sign quantity by kind', () => {
    for (let i = 0; i < 300; i++) {
      const move = stockMoveAt(i * 31)
      if (move.kind === 'issue') expect(move.quantity).toBeLessThan(0)
      if (move.kind === 'receipt') expect(move.quantity).toBeGreaterThan(0)
    }
  })
})

describe('invoices', () => {
  it('sum lines with VAT', () => {
    const totals = invoiceTotals([{ id: 'a', productId: 'P-1', description: 'x', quantity: 10, unitPriceCents: 1000 }])
    expect(totals).toEqual({ subtotalCents: 10000, vatCents: 2100, totalCents: 12100 })
  })
  it('have lines priced from the catalog', () => {
    const invoice = invoiceAt(0)
    expect(invoice.lines.length).toBeGreaterThanOrEqual(3)
    expect(invoice.lines.every((line) => line.unitPriceCents === productAt(Number(line.productId.slice(2)) - 200).priceCents)).toBe(true)
  })
})

describe('activity', () => {
  it('has 30 days and 12 weeks', () => {
    expect(activitySeries('day')).toHaveLength(30)
    expect(activitySeries('week')).toHaveLength(12)
  })
})
