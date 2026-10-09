import { view } from '@protobase/schema'
import type { stockMoves } from './data'

export const stockMovesView = view<typeof stockMoves>('stockMoves')
  .names({ singular: 'Stock move', plural: 'Stock moves' })
  .fields((r) => ({
    movedAt: r.movedAt.label('Moved at').format('absolute'),
    productId: r.productId.label('Product'),
    kind: r.kind.label('Type').help('Receipts add stock, issues remove it, transfers move it between locations.').format('badge').valueLabels({ receipt: 'Receipt', issue: 'Issue', transfer: 'Transfer', adjustment: 'Adjustment' }),
    quantity: r.quantity.help('Negative for issues.'),
    warehouseId: r.warehouseId.label('Warehouse'),
    unitCost: r.unitCost.label('Unit cost').prefix('€').decimals(2),
    userId: r.userId.label('By'),
  }))
  .list((r) => ({
    columns: [r.movedAt, r.productId, r.kind, r.quantity, r.warehouseId, r.unitCost, r.reference, r.userId],
    sort: [[r.movedAt, 'desc']],
  }))
  .filters((r, w) => [
    w.facets(r.kind),
    w.facets(r.warehouseId),
    w.dateRange(r.movedAt, { presets: ['7d', '30d', '90d', 'quarter', 'year'] }),
    w.range(r.quantity, { histogram: true }),
  ])
  .chart((r) => ({ field: r.movedAt, range: '30d', granularity: 'day' }))
