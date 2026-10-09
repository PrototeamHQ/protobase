import { f, resource } from '@protobase/schema'
import { access } from '../roles'

/** core.organizations. Unique: (slug) */
export const organizations = resource('organizations')
  .table('core.organizations')
  .fields({
    id: f.integer().readOnly().filterable().sortable().dbDefault(),
    name: f.text(),
    slug: f.text().filterable().sortable(),
    city: f.text(),
    kvkNumber: f.text(),
    createdAt: f.timestamp().readOnly().dbDefault(),
    updatedAt: f.timestamp().readOnly().dbDefault(),
  })
  .primaryKey((r) => r.id)
  .access(access('organizations'))
