import { formatMoney } from '../format'
import { invoiceTotals, type InvoiceLine } from '../mocks'

export const TotalsFooter = ({ lines, vatRate }: { lines: InvoiceLine[]; vatRate: number }) => {
  const totals = invoiceTotals(lines, vatRate)
  return (
    <dl className="ml-auto grid w-64 grid-cols-[1fr_auto] gap-x-6 gap-y-1 px-2 pt-3 text-[13px] tabular-nums">
      <dt className="text-muted-foreground">Subtotal</dt>
      <dd className="text-right text-foreground">{formatMoney(totals.subtotalCents)}</dd>
      <dt className="text-muted-foreground">VAT {Math.round(vatRate * 100)}%</dt>
      <dd className="text-right text-foreground">{formatMoney(totals.vatCents)}</dd>
      <dt className="mt-1 border-t border-border pt-2 font-semibold text-foreground">Total</dt>
      <dd className="mt-1 border-t border-border pt-2 text-right text-[15px] font-semibold text-foreground">{formatMoney(totals.totalCents)}</dd>
    </dl>
  )
}
