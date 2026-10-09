import { view } from '@protobase/schema'
import type { invoiceLines } from './data'

export const invoiceLinesView = view<typeof invoiceLines>('invoiceLines')
  .nav({ hidden: true })
  .names({ singular: 'Invoice line', plural: 'Invoice lines' })
  .list((r) => ({ columns: [r.position, r.quantity, r.unitPrice, r.lineTotal] }))
