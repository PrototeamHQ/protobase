import { f, resource } from '@protobase/schema'
import { erpAccess } from '../roles'

/** catalog.categories. Unique: (organization_id, slug) */
export const categories = resource('categories')
  .table('catalog.categories')
  .fields({
    id: f.integer().readOnly().filterable().sortable().dbDefault(),
    organizationId: f.relation('organizations').filterable().sortable(),
    parentId: f.relation('categories').optional().filterable().sortable(),
    name: f.text(),
    slug: f.text().filterable().sortable(),
    position: f.integer().default(0).sortable(),
    createdAt: f.timestamp().readOnly().dbDefault(),
    updatedAt: f.timestamp().readOnly().dbDefault(),
  })
  .primaryKey((r) => r.id)
  .tenant((r) => r.organizationId)
  .access(erpAccess('categories'))
