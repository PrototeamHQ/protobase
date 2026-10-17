import { l, view } from '@protobase/schema'
import type { categories } from './data'

export const categoriesView = view<typeof categories>('categories')
  .names({ singular: 'Category', plural: 'Categories' })
  .list((r) => ({ columns: [r.name, r.slug, r.position] }))
  .layout((r) => [
    l.section('Category', [r.name, r.slug, r.parent_id, r.position]),
    // Sorted by hand with its Sort button, since each category's subcategories have an order of their own
    l.related('Subcategories', { resource: 'categories', field: 'parent_id', sort: 'position', columns: ['name', 'slug'] }),
  ])
