import { defineRoles } from '@protobase/schema'

/** Resources plus the area that gates tenants' income and bank details. */
export type RealEstateName =
  | 'organizations' | 'users' | 'amenities' | 'owners' | 'properties' | 'units' | 'unit_amenities' | 'valuations'
  | 'tenants' | 'leases' | 'lease_tenants' | 'deposits' | 'rent_charges' | 'payments' | 'arrears'
  | 'vendors' | 'tickets' | 'work_orders' | 'inspections'
  | 'screening'

/**
 * Capabilities are `<resource|area>.<action>[.own]`. Property managers run the portfolio and the leases, finance the
 * money, maintenance the tickets; `.own` tickets are those assigned to the user. The `screening` area gates a tenant's
 * income and IBAN, which maintenance staff, who call tenants to plan a visit, do not see.
 */
export const roles = defineRoles<RealEstateName>({
  admin: ['*'],
  manager: [
    'owners.read', 'owners.create', 'owners.update',
    'properties.read', 'properties.create', 'properties.update',
    'units.read', 'units.create', 'units.update', 'unit_amenities.*', 'amenities.read', 'valuations.read',
    'tenants.read', 'tenants.create', 'tenants.update', 'screening.read',
    'leases.read', 'leases.create', 'leases.update', 'lease_tenants.*', 'deposits.read',
    'rent_charges.read', 'payments.read', 'arrears.read',
    'tickets.read', 'tickets.create', 'tickets.update', 'work_orders.read', 'vendors.read', 'inspections.*',
    'organizations.read', 'users.read',
  ],
  finance: [
    'rent_charges.*', 'payments.*', 'arrears.read', 'deposits.*', 'valuations.*',
    'leases.read', 'lease_tenants.read', 'tenants.read', 'screening.read',
    'units.read', 'properties.read', 'owners.read', 'work_orders.read', 'vendors.read',
    'organizations.read', 'users.read',
  ],
  maintenance: [
    'tickets.read', 'tickets.create', 'tickets.update.own', 'work_orders.*', 'inspections.*', 'vendors.*',
    'properties.read', 'units.read', 'amenities.read', 'unit_amenities.read', 'tenants.read', 'users.read',
  ],
})

/** The standard rule set for a resource: every operation needs the matching capability. */
export const access = (name: RealEstateName) => ({
  read: roles.can(`${name}.read`),
  create: roles.can(`${name}.create`),
  update: roles.can(`${name}.update`),
  delete: roles.can(`${name}.delete`),
})
