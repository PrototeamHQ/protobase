import { view } from '@protobase/schema'
import type { stockLevels } from './data'

export const stockLevelsView = view<typeof stockLevels>('stockLevels')
  .names({ singular: 'Stock level', plural: 'Stock levels' })
  .list((r) => ({ columns: [r.quantity] }))
