import { tree } from '../data/catalogTree'
import { slugify } from '../format'

type Category = { name: string; slug: string; parent: number | null; position: number }
type Base = { name: string; price: number; category: number; code: string }

export const categories: Category[] = []
export const bases: Base[] = []

tree.forEach((root, rootPosition) => {
  const rootIndex = categories.length
  categories.push({ name: root.name, slug: slugify(root.name), parent: null, position: rootPosition })
  root.children.forEach((child, childPosition) => {
    const childIndex = categories.length
    categories.push({ name: child.name, slug: slugify(child.name), parent: rootIndex, position: childPosition })
    child.items.forEach(([name, price]) => bases.push({ name, price, category: childIndex, code: root.code }))
  })
})
