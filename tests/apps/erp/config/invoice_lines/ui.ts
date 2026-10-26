import { view } from '@protobase/schema'
import type { invoiceLines } from './data'

export const invoiceLinesView = view<typeof invoiceLines>('invoice_lines')
  .nav({ hidden: true })
  .names({ singular: 'Invoice line', plural: 'Invoice lines' })
  .list((r) => ({ columns: [r.position, r.quantity, r.unit_price, r.line_total] }))
