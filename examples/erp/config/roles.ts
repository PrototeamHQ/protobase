import { defineRoles } from '@protobase/schema'

/** Resources plus the area that gates hidden columns. */
export type ErpName =
  | 'categories' | 'products' | 'countries' | 'currencies' | 'organizations' | 'users'
  | 'companies' | 'company_tags' | 'people' | 'tags' | 'emp_master' | 'locations'
  | 'stock_levels' | 'stock_moves' | 'warehouses' | 'invoice_lines' | 'invoices'
  | 'order_lines' | 'orders' | 'notification_settings'
  | 'costs'

/** Each person's own notification settings, which the account page's Notifications tab shows. */
const ownNotificationSettings = ['notification_settings.read.own', 'notification_settings.create.own', 'notification_settings.update.own'] as const

/**
 * Capabilities are `<resource|area>.<action>[.<scope>]`. `.own` rows are those whose `.owner()`
 * field is the user's id. The `costs` area gates cost columns; salaries are admin-only via `roles.is('admin')`.
 */
export const roles = defineRoles<ErpName>({
  admin: ['*'],
  auditor: ['*.read', ...ownNotificationSettings],
  manager: ['*.read', '*.create', '*.update', 'costs.read'],
  sales: [
    ...ownNotificationSettings,
    'orders.read.own', 'orders.create', 'orders.update.own',
    'order_lines.read', 'order_lines.create', 'order_lines.update', 'order_lines.delete',
    'companies.read', 'companies.create', 'companies.update',
    'people.read', 'people.create', 'people.update',
    'company_tags.read', 'company_tags.create', 'company_tags.delete', 'tags.read',
    'products.read', 'categories.read', 'countries.read', 'currencies.read', 'stock_levels.read',
  ],
  accountant: [
    ...ownNotificationSettings,
    'invoices.*', 'invoice_lines.*',
    'orders.read', 'order_lines.read', 'companies.read',
    'products.read', 'categories.read', 'countries.read', 'currencies.read',
    'costs.read',
  ],
  warehouse: [
    ...ownNotificationSettings,
    'stock_levels.*', 'stock_moves.*', 'locations.*', 'warehouses.read',
    'orders.read', 'orders.update', 'order_lines.read',
    'products.read', 'categories.read',
  ],
  editor: [
    ...ownNotificationSettings,
    'products.*', 'categories.*', 'tags.*', 'company_tags.*',
    'countries.read', 'currencies.read',
  ],
  integration: [
    'orders.read', 'orders.create', 'order_lines.read', 'order_lines.create',
    'products.read', 'companies.read', 'stock_levels.read',
  ],
})

/** The standard rule set for a resource: every operation needs the matching capability. */
export const erpAccess = (name: ErpName) => ({
  read: roles.can(`${name}.read`),
  create: roles.can(`${name}.create`),
  update: roles.can(`${name}.update`),
  delete: roles.can(`${name}.delete`),
})
