import { f, resource } from '@protobase/schema'
import { erpAccess } from '../roles'

/** core.organizations. Unique: (slug) */
export const organizations = resource('organizations')
  .table('core.organizations')
  .fields({
    id: f.integer().readOnly().filterable().sortable().dbDefault(),
    name: f.text(),
    slug: f.text().filterable().sortable(),
    countryCode: f.relation('countries').filterable().sortable(),
    currencyCode: f.relation('currencies').filterable().sortable(),
    createdAt: f.timestamp().readOnly().dbDefault(),
    updatedAt: f.timestamp().readOnly().dbDefault(),
  })
  .primaryKey((r) => r.id)
  .access(erpAccess('organizations'))
