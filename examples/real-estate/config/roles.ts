import { defineRoles } from '@protobase/schema'

/** Resources plus the area that gates tenants' income and bank details. */
export type RealEstateName =
  | 'organizations' | 'users' | 'amenities' | 'owners' | 'properties' | 'units' | 'unitAmenities' | 'valuations'
  | 'tenants' | 'leases' | 'leaseTenants' | 'deposits' | 'rentCharges' | 'payments' | 'arrears'
  | 'vendors' | 'tickets' | 'workOrders' | 'inspections'
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
    'units.read', 'units.create', 'units.update', 'unitAmenities.*', 'amenities.read', 'valuations.read',
    'tenants.read', 'tenants.create', 'tenants.update', 'screening.read',
    'leases.read', 'leases.create', 'leases.update', 'leaseTenants.*', 'deposits.read',
    'rentCharges.read', 'payments.read', 'arrears.read',
    'tickets.read', 'tickets.create', 'tickets.update', 'workOrders.read', 'vendors.read', 'inspections.*',
    'organizations.read', 'users.read',
  ],
  finance: [
    'rentCharges.*', 'payments.*', 'arrears.read', 'deposits.*', 'valuations.*',
    'leases.read', 'leaseTenants.read', 'tenants.read', 'screening.read',
    'units.read', 'properties.read', 'owners.read', 'workOrders.read', 'vendors.read',
    'organizations.read', 'users.read',
  ],
  maintenance: [
    'tickets.read', 'tickets.create', 'tickets.update.own', 'workOrders.*', 'inspections.*', 'vendors.*',
    'properties.read', 'units.read', 'amenities.read', 'unitAmenities.read', 'tenants.read', 'users.read',
  ],
})

/** The standard rule set for a resource: every operation needs the matching capability. */
export const access = (name: RealEstateName) => ({
  read: roles.can(`${name}.read`),
  create: roles.can(`${name}.create`),
  update: roles.can(`${name}.update`),
  delete: roles.can(`${name}.delete`),
})
