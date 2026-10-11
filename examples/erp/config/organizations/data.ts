import { f, resource } from '@protobase/schema'
import { erpAccess } from '../roles'

/** core.organizations. Unique: (slug) */
export const organizations = resource('organizations')
  .table('core.organizations')
  .fields({
    id: f.integer().readOnly().filterable().sortable().dbDefault(),
    name: f.text(),
    slug: f.text().filterable().sortable(),
    country_code: f.relation('countries').filterable().sortable(),
    currency_code: f.relation('currencies').filterable().sortable(),
    created_at: f.timestamp().readOnly().dbDefault(),
    updated_at: f.timestamp().readOnly().dbDefault(),
  })
  .primaryKey((r) => r.id)
  .access(erpAccess('organizations'))
