import { defineRoles, f, resource } from '@protobase/schema'

// Access for the bike shop's work orders: who may do what, which rows they see, and which fields.

/** Roles are bundles of capabilities: `<resource or area>.<action>[.own]`, `*` for everything. */
export const roles = defineRoles({
  admin: ['*'],
  desk: ['workOrders.read', 'workOrders.create', 'workOrders.update', 'money.read'],
  mechanic: ['workOrders.read.own', 'workOrders.update.own'],
})

/** shop.work_orders */
export const workOrders = resource('workOrders')
  .table('shop.work_orders')
  .fields({
    id: f.integer().readOnly().filterable().sortable().dbDefault(),
    assignee: f.text().filterable(),
    task: f.text(),
    status: f.enum(['open', 'done']).default('open').filterable(),
    // Only roles holding `money.read` see the price of the labour; only an admin may change it.
    labour: f.decimal({ precision: 8, scale: 2 }).access({ read: roles.can('money.read'), update: roles.is('admin') }),
  })
  .primaryKey((r) => r.id)
  // `.own` capabilities match the rows whose assignee is the signed-in user's id.
  .owner((r) => r.assignee)
  .access({
    read: roles.can('workOrders.read'),
    create: roles.can('workOrders.create'),
    // A finished work order is closed: this rule needs the record, so it is checked against the stored row.
    update: roles.can('workOrders.update').and((_ctx, record) => (record as { status: string }).status !== 'done'),
    delete: roles.is('admin'),
  })
