import type { Db } from '../../db/connection'
import { categories } from '../builders/categories'
import { productAt } from '../builders/product'
import { DAY, windowStart } from '../calendar'
import { copyRows } from '../copy'
import { iso, money, row } from '../format'
import type { World } from '../world'

function* categoryRows(world: World) {
  const createdAt = iso(windowStart - 4 * 365 * DAY)
  for (const org of world.orgs) {
    for (const [index, category] of categories.entries()) {
      const parentId = category.parent === null ? null : org.categoryFirstId + category.parent
      yield row(org.categoryFirstId + index, org.id, parentId, category.name, category.slug, category.position, createdAt, createdAt)
    }
  }
}

function* productRows(world: World) {
  for (const org of world.orgs) {
    for (let ordinal = 0; ordinal < org.productCount; ordinal++) {
      const product = productAt(org, ordinal)
      const createdAt = iso(product.createdAt)
      const deletedAt = product.deletedAt === null ? null : iso(product.deletedAt)
      const updatedAt = iso(Math.max(product.createdAt, product.deletedAt ?? windowStart - 30 * DAY))
      yield row(product.id, org.id, product.categoryId, product.sku, product.name, product.description, money(product.priceCents), 'EUR', JSON.stringify(product.attributes), deletedAt === null, deletedAt, createdAt, updatedAt)
    }
  }
}

export const seedCatalog = async (sql: Db, world: World) => {
  await copyRows(sql, 'catalog.categories (id, organization_id, parent_id, name, slug, position, created_at, updated_at)', categoryRows(world))
  await copyRows(sql, 'catalog.products (id, organization_id, category_id, sku, name, description, price, currency_code, attributes, active, deleted_at, created_at, updated_at)', productRows(world))
}
