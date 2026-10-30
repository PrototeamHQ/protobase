import { view } from '@protobase/schema'
import type { stockLevels } from './data'

export const stockLevelsView = view<typeof stockLevels>('stock_levels')
  .names({ singular: 'Stock level', plural: 'Stock levels' })
  .fields((r) => ({ quantity: r.quantity.format('signed') }))
  .list((r) => ({ columns: [r.quantity] }))
