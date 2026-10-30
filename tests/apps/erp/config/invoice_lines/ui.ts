import { view } from '@protobase/schema'
import type { invoiceLines } from './data'

export const invoiceLinesView = view<typeof invoiceLines>('invoice_lines')
  .nav({ hidden: true })
  .names({ singular: 'Invoice line', plural: 'Invoice lines' })
  .fields((r) => ({ product_id: r.product_id.label('Product'), unit_price: r.unit_price.prefix('€').decimals(2), line_total: r.line_total.prefix('€').decimals(2) }))
  .list((r) => ({ columns: [r.position, r.product_id, r.description, r.quantity, r.unit_price, r.line_total] }))
