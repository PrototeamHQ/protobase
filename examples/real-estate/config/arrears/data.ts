import { f, resource } from '@protobase/schema'
import { roles } from '../roles'

/**
 * billing.arrears, a view: the leases that still owe rent, with what they owe. It reads the open charges only, through
 * a partial index, so it stays quick however much history there is. Read-only: payments change it.
 */
export const arrears = resource('arrears')
  .table('billing.arrears')
  .fields({
    lease_id: f.relation('leases').readOnly().filterable().sortable(),
    organization_id: f.relation('organizations').readOnly().filterable().sortable(),
    open_charges: f.integer().readOnly().filterable().sortable(),
    balance: f.decimal({ precision: 12, scale: 2 }).readOnly().filterable().sortable(),
    oldest_due_on: f.date().readOnly().filterable().sortable(),
  })
  .primaryKey((r) => r.lease_id)
  .tenant((r) => r.organization_id)
  .access({ read: roles.can('arrears.read'), create: () => false, update: () => false, delete: () => false })
