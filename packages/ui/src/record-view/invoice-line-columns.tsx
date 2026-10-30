import { formatMoney } from '../format'
import { NumberCell, type LineColumn } from '../inline-child-table'
import { text } from '../inline-child-table/messages'
import { lineTotalCents, type InvoiceLine } from '../mocks'

const parseEuros = (typed: string) => Math.round(Number(typed.replace(',', '.').replace(/[^0-9.]/g, '')) * 100)

/** The sample invoice's columns: the item, its quantity and unit price, which `onChange` edits, and the line's total. */
export const invoiceLineColumns = (onChange?: (id: string, patch: Partial<InvoiceLine>) => void): LineColumn<InvoiceLine>[] => [
  {
    key: 'item',
    label: text('item'),
    cell: (line) => (
      <div className="min-w-0">
        <p className="truncate text-foreground">{line.description}</p>
        <p className="font-mono text-[11px] text-faint-foreground">{line.productId}</p>
      </div>
    ),
  },
  {
    key: 'quantity',
    label: text('qty'),
    align: 'right',
    width: '88px',
    cell: (line) =>
      onChange ? (
        <NumberCell label={text('quantity')} value={line.quantity} format={String} parse={(typed) => Math.round(Number(typed))} onCommit={(quantity) => onChange(line.id, { quantity })} />
      ) : (
        <span className="px-2 tabular-nums">{line.quantity}</span>
      ),
  },
  {
    key: 'unitPrice',
    label: text('unitPrice'),
    align: 'right',
    width: '112px',
    cell: (line) =>
      onChange ? (
        <NumberCell label={text('unitPrice')} value={line.unitPriceCents} format={(cents) => (cents / 100).toFixed(2)} parse={parseEuros} onCommit={(unitPriceCents) => onChange(line.id, { unitPriceCents })} />
      ) : (
        <span className="px-2 tabular-nums">{(line.unitPriceCents / 100).toFixed(2)}</span>
      ),
  },
  {
    key: 'total',
    label: text('lineTotal'),
    align: 'right',
    width: '112px',
    cell: (line) => <span className="px-2 font-medium tabular-nums text-foreground">{formatMoney(lineTotalCents(line))}</span>,
  },
]
