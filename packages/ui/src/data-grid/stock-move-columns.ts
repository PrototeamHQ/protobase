import type { ColumnSpec } from './column-spec'

export const stockMovesNaturalSort = { columnId: 'movedAt', direction: 'asc' } as const

export const stockMoveColumns: ColumnSpec[] = [
  { id: 'movedAt', header: 'Moved at', kind: 'datetime', width: 235, sortable: true },
  { id: 'product', header: 'Product', kind: 'relation', width: 190 },
  { id: 'warehouse', header: 'Site', kind: 'text', width: 115, sortable: true },
  {
    id: 'kind',
    header: 'Type',
    kind: 'status',
    width: 150,
    sortable: true,
    tones: { receipt: 'green', issue: 'blue', transfer: 'violet', adjustment: 'amber' },
    labels: { receipt: 'Receipt', issue: 'Issue', transfer: 'Transfer', adjustment: 'Adjustment' },
  },
  { id: 'quantity', header: 'Qty', kind: 'signed', width: 100, sortable: true },
  { id: 'unitCostCents', header: 'Cost', kind: 'money', width: 110, currency: 'EUR' },
  { id: 'reference', header: 'Reference', kind: 'id', width: 150 },
  { id: 'user', header: 'By', kind: 'user', width: 130 },
]
