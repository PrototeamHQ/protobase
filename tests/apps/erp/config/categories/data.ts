import { f, resource } from '@protobase/schema'
import { erpAccess } from '../roles'

/** catalog.categories. Unique: (organization_id, slug) */
export const categories = resource('categories')
  .table('catalog.categories')
  .fields({
    id: f.integer().readOnly().filterable().sortable().dbDefault(),
    organization_id: f.relation('organizations').filterable().sortable(),
    parent_id: f.relation('categories').optional().filterable().sortable(),
    name: f.text(),
    slug: f.text().filterable().sortable(),
    position: f.integer().default(0).sortable(),
    created_at: f.timestamp().readOnly().dbDefault(),
    updated_at: f.timestamp().readOnly().dbDefault(),
  })
  .primaryKey((r) => r.id)
  .tenant((r) => r.organization_id)
  .position((r) => r.position, { within: (r) => r.parent_id })
  .access(erpAccess('categories'))
