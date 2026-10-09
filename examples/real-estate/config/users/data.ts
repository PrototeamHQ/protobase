import { f, resource } from '@protobase/schema'
import { access } from '../roles'

/** core.users. Unique: (organization_id, email) */
export const users = resource('users')
  .table('core.users')
  .fields({
    id: f.integer().readOnly().filterable().sortable().dbDefault(),
    organizationId: f.relation('organizations').filterable().sortable(),
    email: f.text().filterable().sortable(),
    name: f.text(),
    role: f.enum(['admin', 'manager', 'finance', 'maintenance']).filterable().sortable(),
    active: f.boolean().default(true),
    createdAt: f.timestamp().readOnly().dbDefault(),
    updatedAt: f.timestamp().readOnly().dbDefault(),
  })
  .primaryKey((r) => r.id)
  .tenant((r) => r.organizationId)
  .access(access('users'))
