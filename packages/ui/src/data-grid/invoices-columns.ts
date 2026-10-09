import { invoiceAt, invoiceTotals } from '../mocks'
import type { ColumnSpec, GridRow } from './column-spec'
import { discountColumn } from './orders-columns'

export const invoiceCount = 4218

export const invoicesNaturalSort = { columnId: 'issuedAt', direction: 'desc' } as const

export const invoiceRowAt = (index: number): GridRow => {
  const invoice = invoiceAt(index % invoiceCount)
  const discount = [0, 0, 5, 10, 15][index % 5]!
  return {
    id: invoice.id,
    number: invoice.number,
    customer: { id: invoice.customer.id, name: invoice.customer.name },
    status: invoice.status,
    issuedAt: invoice.issuedAt,
    dueAt: invoice.dueAt,
    discount,
    totalCents: Math.round(invoiceTotals(invoice.lines).totalCents * (1 - discount / 100)),
  }
}

const baseColumns: ColumnSpec[] = [
  { id: 'number', header: 'Invoice', kind: 'id', width: 150, sortable: true },
  { id: 'customer', header: 'Customer', kind: 'relation', width: 270, sortable: true },
  { id: 'status', header: 'Status', kind: 'status', width: 120, sortable: true, tones: { draft: 'neutral', sent: 'blue', paid: 'green', overdue: 'red' }, labels: { draft: 'Draft', sent: 'Sent', paid: 'Paid', overdue: 'Overdue' } },
  { id: 'issuedAt', header: 'Issued', kind: 'date', width: 120, sortable: true },
  { id: 'dueAt', header: 'Due', kind: 'date', width: 120, sortable: true },
  { id: 'totalCents', header: 'Total', kind: 'money', width: 130, sortable: true, currency: 'EUR' },
]

export const invoicesColumns = (withDiscount: boolean, highlight = false): ColumnSpec[] =>
  withDiscount ? baseColumns.filter((column) => column.id !== 'dueAt').flatMap((column) => (column.id === 'totalCents' ? [{ ...discountColumn, highlight, width: 160 }, column] : [column])) : baseColumns
