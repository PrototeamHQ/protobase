import { view } from '@protobase/schema'
import type { products } from './data'

export const productsView = view<typeof products>('products')
  .names({ singular: 'Product', plural: 'Products' })
  .icon('package')
  .fields((r) => ({ sku: r.sku.format('code') }))
  .list((r) => ({ columns: [r.sku, r.name, r.price, r.active] }))
