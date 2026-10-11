import { f, resource } from '@protobase/schema'
import { erpAccess } from '../roles'

/** catalog.products. Unique: (organization_id, sku) */
export const products = resource('products')
  .table('catalog.products')
  .fields({
    id: f.bigint().readOnly().filterable().sortable().dbDefault(),
    organization_id: f.relation('organizations').filterable().sortable(),
    category_id: f.relation('categories').filterable().sortable(),
    sku: f.text().filterable().sortable(),
    name: f.text().filterable(),
    description: f.text().optional(),
    price: f.decimal({ precision: 12, scale: 2 }),
    currency_code: f.relation('currencies'),
    attributes: f.json().dbDefault(),
    active: f.boolean().default(true),
    deleted_at: f.timestamp().optional(),
    created_at: f.timestamp().readOnly().filterable().sortable().dbDefault(),
    updated_at: f.timestamp().readOnly().dbDefault(),
  })
  .primaryKey((r) => r.id)
  .softDelete((r) => r.deleted_at)
  .tenant((r) => r.organization_id)
  .access(erpAccess('products'))
