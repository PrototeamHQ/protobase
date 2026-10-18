import { f, l, resource, view } from '@protobase/schema'

// A small letting business for the related-record and sensitive-field stories: a tenant's homes through the leases
// they signed, a unit's tenants through its running lease, and an IBAN hidden like a password.

const properties = resource('properties')
  .table('properties')
  .fields({ id: f.integer().readOnly().filterable().sortable(), name: f.text() })
  .primaryKey((r) => r.id)

const units = resource('units')
  .table('units')
  .fields({ id: f.integer().readOnly().filterable().sortable(), property_id: f.relation('properties').filterable(), label: f.text(), status: f.enum(['let', 'vacant']) })
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
    unit_id: f.relation('units').filterable(),
    start_date: f.date().filterable().sortable(),
    end_date: f.date().optional().filterable().sortable(),
  })
  .primaryKey((r) => r.id)

const leaseTenants = resource('lease_tenants')
  .table('lease_tenants')
  .fields({ lease_id: f.relation('leases').filterable(), tenant_id: f.relation('tenants').filterable(), role: f.enum(['primary', 'co_signer']).sortable() })
  .primaryKey((r) => [r.lease_id, r.tenant_id])

// now() does not evaluate on dates in the stories' fake API, so "today" is a fixed day there
const running = 'start_date <= "2026-10-09" AND (isNull(end_date) OR end_date >= "2026-10-09")'

const propertiesView = view<typeof properties>('properties').title((r) => r.name).names({ singular: 'Property', plural: 'Properties' })

const unitsView = view<typeof units>('units')
  .title((r) => r.label)
  .names({ singular: 'Unit', plural: 'Units' })
  .fields((r) => ({ property_id: r.property_id.label('Property'), status: r.status.valueLabels({ let: 'Let', vacant: 'Vacant' }) }))
  .layout((r) => [
    l.section('Unit', [r.property_id, r.label, r.status]),
    l.related('Let to', { resource: 'lease_tenants', field: 'lease_id', through: { resource: 'leases', field: 'unit_id', filter: running }, sort: 'role desc', columns: ['tenant_id', 'role', 'tenant_id.email'], empty: 'Vacant: no lease runs today.' }),
    l.related('Running lease', { resource: 'leases', field: 'unit_id', filter: running, columns: ['number', 'start_date', 'end_date'], empty: 'Vacant: no lease runs today.' }),
  ])

const tenantsView = view<typeof tenants>('tenants')
  .title((r) => r.name)
  .names({ singular: 'Tenant', plural: 'Tenants' })
  .fields((r) => ({ iban: r.iban.label('IBAN').format('code') }))
  .list((r) => ({ columns: [r.name, r.email] }))
  .layout((r) => [
    l.section('Tenant', [r.name, r.email, r.iban]),
    l.related('Homes', { resource: 'leases', field: 'id', through: { resource: 'lease_tenants', field: 'tenant_id', key: 'lease_id' }, sort: 'end_date desc, start_date desc', columns: ['number', 'unit_id.property_id', 'unit_id', 'start_date', 'end_date'], empty: 'No leases yet.' }),
  ])

const leasesView = view<typeof leases>('leases').title((r) => r.number).names({ singular: 'Lease', plural: 'Leases' }).fields((r) => ({ unit_id: r.unit_id.label('Unit'), start_date: r.start_date.label('Start'), end_date: r.end_date.label('End') }))

const leaseTenantsView = view<typeof leaseTenants>('lease_tenants').nav({ hidden: true }).names({ singular: 'Lease tenant', plural: 'Lease tenants' }).fields((r) => ({ tenant_id: r.tenant_id.label('Tenant'), role: r.role.format('badge').valueLabels({ primary: 'Primary', co_signer: 'Co-signer' }) }))

export const rentalResources = [properties, units, tenants, leases, leaseTenants].map((entry) => entry.toModel())

export const rentalViews = [propertiesView, unitsView, tenantsView, leasesView, leaseTenantsView].map((entry) => entry.toModel())

export const rentalIbans = { ada: 'NL91ABNA0417164300', bram: 'NL20INGB0001234567' }

export const rentalRows = {
  properties: [{ id: 1, name: 'Keizersgracht 120' }, { id: 2, name: 'Oudegracht 7' }],
  units: [
    { id: 1, property_id: 1, label: 'Keizersgracht 120 2.01', status: 'let' },
    { id: 2, property_id: 1, label: 'Keizersgracht 120 2.02', status: 'vacant' },
    { id: 3, property_id: 2, label: 'Oudegracht 7', status: 'let' },
  ],
  tenants: [
    { id: 1, name: 'Ada de Vries', email: 'ada@example.test', iban: rentalIbans.ada },
    { id: 2, name: 'Bram Jansen', email: 'bram@example.test', iban: rentalIbans.bram },
  ],
  leases: [
    { id: 1, number: 'L-2019-004', unit_id: 3, start_date: '2019-03-01', end_date: '2023-02-28' },
    { id: 2, number: 'L-2023-017', unit_id: 1, start_date: '2023-03-01', end_date: null },
    { id: 3, number: 'L-2021-009', unit_id: 2, start_date: '2021-05-01', end_date: '2025-04-30' },
  ],
  lease_tenants: [
    { lease_id: 1, tenant_id: 1, role: 'primary' },
    { lease_id: 2, tenant_id: 1, role: 'primary' },
    { lease_id: 2, tenant_id: 2, role: 'co_signer' },
    { lease_id: 3, tenant_id: 2, role: 'primary' },
  ],
}
