import { view } from '@protobase/schema'
import type { categories } from './data'

export const categoriesView = view<typeof categories>('categories')
  .names({ singular: 'Category', plural: 'Categories' })
  .list((r) => ({ columns: [r.name, r.slug, r.position] }))
