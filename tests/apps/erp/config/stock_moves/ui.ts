import { view } from '@protobase/schema'
import type { stockMoves } from './data'

export const stockMovesView = view<typeof stockMoves>('stock_moves')
  .names({ singular: 'Stock move', plural: 'Stock moves' })
  .fields((r) => ({
    moved_at: r.moved_at.label('Moved at').format('absolute'),
    product_id: r.product_id.label('Product'),
    kind: r.kind.label('Type').help('Receipts add stock, issues remove it, transfers move it between locations.').format('badge')
      .valueLabels({ receipt: 'Receipt', issue: 'Issue', transfer: 'Transfer', adjustment: 'Adjustment' })
      .valueColors({ receipt: 'green', issue: 'blue', transfer: 'violet', adjustment: 'amber' }),
    quantity: r.quantity.help('Negative for issues.').format('signed'),
    warehouse_id: r.warehouse_id.label('Warehouse'),
    unit_cost: r.unit_cost.label('Unit cost').prefix('€').currency('EUR').decimals(2),
    reference: r.reference.format('code'),
    user_id: r.user_id.label('By'),
  }))
  .list((r) => ({
    columns: [r.moved_at, r.product_id, r.kind, r.quantity, r.warehouse_id, r.unit_cost, r.reference, r.user_id],
    sort: [[r.moved_at, 'desc']],
  }))
  .filters((r, w) => [
    w.facets(r.kind),
    w.facets(r.warehouse_id),
    w.dateRange(r.moved_at, { presets: ['7d', '30d', '90d', 'quarter', 'year'] }),
    w.range(r.quantity, { histogram: true }),
  ])
  .chart((r) => ({ field: r.moved_at, range: '30d', granularity: 'day' }))
