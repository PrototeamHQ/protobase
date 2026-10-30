import { view } from '@protobase/schema'
import type { warehouses } from './data'

export const warehousesView = view<typeof warehouses>('warehouses')
  .names({ singular: 'Warehouse', plural: 'Warehouses' })
  .fields((r) => ({ code: r.code.format('code') }))
  .list((r) => ({ columns: [r.code, r.name, r.city] }))
