import { l, view } from '@protobase/schema'
import type { tenants } from './data'

export const tenantsView = view<typeof tenants>('tenants')
  .title((r) => r.lastName)
  .searchResult((r) => ({ title: [r.firstName, r.lastName], subtitle: r.email }))
  .names({ singular: 'Tenant', plural: 'Tenants' })
  .fields((r) => ({
    iban: r.iban.label('IBAN').format('code'),
    monthlyIncome: r.monthlyIncome.help('Gross income per month, checked when the lease was signed.').prefix('€').decimals(2),
  }))
  .list((r) => ({ columns: [r.lastName, r.firstName, r.email, r.phone, r.createdAt], sort: [[r.createdAt, 'desc']], search: [r.lastName, r.email] }))
  .filters((r, w) => [w.dateRange(r.createdAt, { presets: ['30d', '90d', 'year'] })])
  .layout((r) => [
    l.section('Tenant', [r.firstName, r.lastName, r.dateOfBirth, r.email, r.phone]),
    l.section('Screening', [r.monthlyIncome, r.iban], { help: 'Seen by property managers and finance only. Showing the IBAN is logged.' }),
    l.related('Homes', {
      resource: 'leases',
      field: 'id',
      through: { resource: 'leaseTenants', field: 'tenantId', key: 'leaseId' },
      // Running indefinite leases have no end date, which sorts first
      sort: 'endDate desc, startDate desc',
      columns: ['number', 'unitId.propertyId', 'unitId', 'startDate', 'endDate', 'monthlyRent'],
      help: 'The properties and units this tenant rents or rented, current leases first.',
      empty: 'This tenant has not signed a lease.',
    }),
  ])
