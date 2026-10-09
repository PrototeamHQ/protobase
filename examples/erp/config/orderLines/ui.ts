import { view } from '@protobase/schema'
import type { orderLines } from './data'

export const orderLinesView = view<typeof orderLines>('orderLines')
  .nav({ hidden: true })
  .names({ singular: 'Order line', plural: 'Order lines' })
  .list((r) => ({ columns: [r.quantity, r.unitPrice, r.productId] }))
