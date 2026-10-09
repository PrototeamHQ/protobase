import { defineRoles } from '@protobase/schema'

/** Resources plus the area that gates hidden columns. */
export type ErpName =
  | 'categories' | 'products' | 'countries' | 'currencies' | 'organizations' | 'users'
  | 'companies' | 'companyTags' | 'people' | 'tags' | 'empMaster' | 'locations'
  | 'stockLevels' | 'stockMoves' | 'warehouses' | 'invoiceLines' | 'invoices'
  | 'orderLines' | 'orders'
  | 'costs'

/**
 * Capabilities are `<resource|area>.<action>[.<scope>]`. `.own` rows are those whose `.owner()`
 * field is the user's id. The `costs` area gates cost columns; salaries are admin-only via `roles.is('admin')`.
 */
export const roles = defineRoles<ErpName>({
  admin: ['*'],
  auditor: ['*.read'],
  manager: ['*.read', '*.create', '*.update', 'costs.read'],
  sales: [
    'orders.read.own', 'orders.create', 'orders.update.own',
    'orderLines.read', 'orderLines.create', 'orderLines.update', 'orderLines.delete',
    'companies.read', 'companies.create', 'companies.update',
    'people.read', 'people.create', 'people.update',
    'companyTags.read', 'companyTags.create', 'companyTags.delete', 'tags.read',
    'products.read', 'categories.read', 'countries.read', 'currencies.read', 'stockLevels.read',
  ],
  accountant: [
    'invoices.*', 'invoiceLines.*',
    'orders.read', 'orderLines.read', 'companies.read',
    'products.read', 'categories.read', 'countries.read', 'currencies.read',
    'costs.read',
  ],
  warehouse: [
    'stockLevels.*', 'stockMoves.*', 'locations.*', 'warehouses.read',
    'orders.read', 'orders.update', 'orderLines.read',
    'products.read', 'categories.read',
  ],
  editor: [
    'products.*', 'categories.*', 'tags.*', 'companyTags.*',
    'countries.read', 'currencies.read',
  ],
  integration: [
    'orders.read', 'orders.create', 'orderLines.read', 'orderLines.create',
    'products.read', 'companies.read', 'stockLevels.read',
  ],
})

/** The standard rule set for a resource: every operation needs the matching capability. */
export const erpAccess = (name: ErpName) => ({
  read: roles.can(`${name}.read`),
  create: roles.can(`${name}.create`),
  update: roles.can(`${name}.update`),
  delete: roles.can(`${name}.delete`),
})
