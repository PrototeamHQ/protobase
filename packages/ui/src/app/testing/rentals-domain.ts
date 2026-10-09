import { f, l, resource, view } from '@protobase/schema'

// A small letting business for the related-record and sensitive-field stories: a tenant's homes through the leases
// they signed, a unit's tenants through its running lease, and an IBAN hidden like a password.

const properties = resource('properties')
  .table('properties')
  .fields({ id: f.integer().readOnly().filterable().sortable(), name: f.text() })
  .primaryKey((r) => r.id)

const units = resource('units')
  .table('units')
  .fields({ id: f.integer().readOnly().filterable().sortable(), propertyId: f.relation('properties').filterable(), label: f.text(), status: f.enum(['let', 'vacant']) })
  .primaryKey((r) => r.id)

const tenants = resource('tenants')
  .table('tenants')
  .fields({ id: f.integer().readOnly().filterable().sortable(), name: f.text(), email: f.text(), iban: f.text().sensitive() })
  .primaryKey((r) => r.id)

const leases = resource('leases')
  .table('leases')
  .fields({
    id: f.integer().readOnly().filterable().sortable(),
    number: f.text(),
    unitId: f.relation('units').filterable(),
    startDate: f.date().filterable().sortable(),
    endDate: f.date().optional().filterable().sortable(),
  })
  .primaryKey((r) => r.id)

const leaseTenants = resource('leaseTenants')
  .table('lease_tenants')
  .fields({ leaseId: f.relation('leases').filterable(), tenantId: f.relation('tenants').filterable(), role: f.enum(['primary', 'co_signer']).sortable() })
  .primaryKey((r) => [r.leaseId, r.tenantId])

// now() does not evaluate on dates in the stories' fake API, so "today" is a fixed day there
const running = 'startDate <= "2026-10-09" AND (isNull(endDate) OR endDate >= "2026-10-09")'

const propertiesView = view<typeof properties>('properties').title((r) => r.name).names({ singular: 'Property', plural: 'Properties' })

const unitsView = view<typeof units>('units')
  .title((r) => r.label)
  .names({ singular: 'Unit', plural: 'Units' })
  .fields((r) => ({ propertyId: r.propertyId.label('Property'), status: r.status.valueLabels({ let: 'Let', vacant: 'Vacant' }) }))
  .layout((r) => [
    l.section('Unit', [r.propertyId, r.label, r.status]),
    l.related('Let to', { resource: 'leaseTenants', field: 'leaseId', through: { resource: 'leases', field: 'unitId', filter: running }, sort: 'role desc', columns: ['tenantId', 'role', 'tenantId.email'], empty: 'Vacant: no lease runs today.' }),
    l.related('Running lease', { resource: 'leases', field: 'unitId', filter: running, columns: ['number', 'startDate', 'endDate'], empty: 'Vacant: no lease runs today.' }),
  ])

const tenantsView = view<typeof tenants>('tenants')
  .title((r) => r.name)
  .names({ singular: 'Tenant', plural: 'Tenants' })
  .fields((r) => ({ iban: r.iban.label('IBAN').format('code') }))
  .list((r) => ({ columns: [r.name, r.email] }))
  .layout((r) => [
    l.section('Tenant', [r.name, r.email, r.iban]),
    l.related('Homes', { resource: 'leases', field: 'id', through: { resource: 'leaseTenants', field: 'tenantId', key: 'leaseId' }, sort: 'endDate desc, startDate desc', columns: ['number', 'unitId.propertyId', 'unitId', 'startDate', 'endDate'], empty: 'No leases yet.' }),
  ])

const leasesView = view<typeof leases>('leases').title((r) => r.number).names({ singular: 'Lease', plural: 'Leases' }).fields((r) => ({ unitId: r.unitId.label('Unit'), startDate: r.startDate.label('Start'), endDate: r.endDate.label('End') }))

const leaseTenantsView = view<typeof leaseTenants>('leaseTenants').nav({ hidden: true }).fields((r) => ({ tenantId: r.tenantId.label('Tenant'), role: r.role.format('badge').valueLabels({ primary: 'Primary', co_signer: 'Co-signer' }) }))

export const rentalResources = [properties, units, tenants, leases, leaseTenants].map((entry) => entry.toModel())

export const rentalViews = [propertiesView, unitsView, tenantsView, leasesView, leaseTenantsView].map((entry) => entry.toModel())

export const rentalIbans = { ada: 'NL91ABNA0417164300', bram: 'NL20INGB0001234567' }

export const rentalRows = {
  properties: [{ id: 1, name: 'Keizersgracht 120' }, { id: 2, name: 'Oudegracht 7' }],
  units: [
    { id: 1, propertyId: 1, label: 'Keizersgracht 120 2.01', status: 'let' },
    { id: 2, propertyId: 1, label: 'Keizersgracht 120 2.02', status: 'vacant' },
    { id: 3, propertyId: 2, label: 'Oudegracht 7', status: 'let' },
  ],
  tenants: [
    { id: 1, name: 'Ada de Vries', email: 'ada@example.test', iban: rentalIbans.ada },
    { id: 2, name: 'Bram Jansen', email: 'bram@example.test', iban: rentalIbans.bram },
  ],
  leases: [
    { id: 1, number: 'L-2019-004', unitId: 3, startDate: '2019-03-01', endDate: '2023-02-28' },
    { id: 2, number: 'L-2023-017', unitId: 1, startDate: '2023-03-01', endDate: null },
    { id: 3, number: 'L-2021-009', unitId: 2, startDate: '2021-05-01', endDate: '2025-04-30' },
  ],
  leaseTenants: [
    { leaseId: 1, tenantId: 1, role: 'primary' },
    { leaseId: 2, tenantId: 1, role: 'primary' },
    { leaseId: 2, tenantId: 2, role: 'co_signer' },
    { leaseId: 3, tenantId: 2, role: 'primary' },
  ],
}
