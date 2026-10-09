import { view } from '@protobase/schema'
import type { warehouses } from './data'

export const warehousesView = view<typeof warehouses>('warehouses')
  .names({ singular: 'Warehouse', plural: 'Warehouses' })
  .list((r) => ({ columns: [r.code, r.name, r.city] }))
