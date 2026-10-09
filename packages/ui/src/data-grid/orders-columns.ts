import type { ColumnSpec } from './column-spec'

export const ordersNaturalSort = { columnId: 'createdAt', direction: 'desc' } as const

export const discountColumn: ColumnSpec = { id: 'discount', header: 'Discount', kind: 'percent', width: 125, sortable: true }

export const ordersColumns: ColumnSpec[] = [
  { id: 'number', header: 'Order', kind: 'id', width: 130, sortable: true },
  { id: 'customer', header: 'Customer', kind: 'relation', width: 260, sortable: true },
  {
    id: 'status',
    header: 'Status',
    kind: 'status',
    width: 120,
    sortable: true,
    tones: { draft: 'neutral', confirmed: 'blue', picking: 'amber', shipped: 'violet', delivered: 'green', cancelled: 'red' },
    labels: { draft: 'Draft', confirmed: 'Confirmed', picking: 'Picking', shipped: 'Shipped', delivered: 'Delivered', cancelled: 'Cancelled' },
  },
  { id: 'totalCents', header: 'Total', kind: 'money', width: 120, sortable: true, currency: 'EUR' },
  { id: 'paid', header: 'Paid', kind: 'boolean', width: 70 },
  { id: 'createdAt', header: 'Created', kind: 'datetime', width: 170, sortable: true },
  { id: 'owner', header: 'Owner', kind: 'user', width: 130 },
]

/** Orders columns with the discount column placed after Total, optionally marked as new. */
export const ordersColumnsWithDiscount = (highlight = false): ColumnSpec[] => {
  const withDiscount = { ...discountColumn, highlight }
  return ordersColumns.flatMap((column) => (column.id === 'totalCents' ? [column, withDiscount] : [column]))
}
