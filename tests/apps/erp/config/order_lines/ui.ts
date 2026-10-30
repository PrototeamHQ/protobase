import { view } from '@protobase/schema'
import type { orderLines } from './data'

export const orderLinesView = view<typeof orderLines>('order_lines')
  .nav({ hidden: true })
  .names({ singular: 'Order line', plural: 'Order lines' })
  .fields((r) => ({ quantity: r.quantity.format('signed') }))
  .list((r) => ({ columns: [r.quantity, r.unit_price, r.product_id] }))
