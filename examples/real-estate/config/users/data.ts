import { f, resource } from '@protobase/schema'
import { access } from '../roles'

/** core.users. Unique: (organization_id, email) */
export const users = resource('users')
  .table('core.users')
  .fields({
    id: f.integer().readOnly().filterable().sortable().dbDefault(),
    organization_id: f.relation('organizations').filterable().sortable(),
    email: f.text().filterable().sortable(),
    name: f.text(),
    role: f.enum(['admin', 'manager', 'finance', 'maintenance']).optional().filterable().sortable(),
    active: f.boolean().default(true),
    created_at: f.timestamp().readOnly().dbDefault(),
    updated_at: f.timestamp().readOnly().dbDefault(),
  })
  .primaryKey((r) => r.id)
  .tenant((r) => r.organization_id)
  .access(access('users'))
