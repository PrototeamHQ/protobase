import { describe, expect, it } from 'vitest'
import { orderLines, orders } from './rollups'

describe('the rollups example', () => {
  it('declares read-only rollup and formula fields', () => {
    expect(orders.toModel().fields.total).toMatchObject({ readOnly: true, rollup: { from: 'order_lines', via: 'order_id', fn: 'sum', field: 'amount' } })
    expect(orderLines.toModel().fields.amount).toMatchObject({ readOnly: true, formula: 'round(quantity * unit_price - coalesce(discount, 0), 2)' })
  })
})
