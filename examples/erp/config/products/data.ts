import { f, resource } from '@protobase/schema'
import { erpAccess } from '../roles'

/** catalog.products. Unique: (organization_id, sku) */
export const products = resource('products')
  .table('catalog.products')
  .fields({
    id: f.bigint().readOnly().filterable().sortable().dbDefault(),
    organizationId: f.relation('organizations').filterable().sortable(),
    categoryId: f.relation('categories').filterable().sortable(),
    sku: f.text().filterable().sortable(),
    name: f.text().filterable(),
    description: f.text().optional(),
    price: f.decimal({ precision: 12, scale: 2 }),
    currencyCode: f.relation('currencies'),
    attributes: f.json().dbDefault(),
    active: f.boolean().default(true),
    deletedAt: f.timestamp().optional(),
    createdAt: f.timestamp().readOnly().filterable().sortable().dbDefault(),
    updatedAt: f.timestamp().readOnly().dbDefault(),
  })
  .primaryKey((r) => r.id)
  .softDelete((r) => r.deletedAt)
  .tenant((r) => r.organizationId)
  .access(erpAccess('products'))
