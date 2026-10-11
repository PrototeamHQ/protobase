import { l, view } from '@protobase/schema'
import type { tenants } from './data'

export const tenantsView = view<typeof tenants>('tenants')
  .title((r) => r.last_name)
  .searchResult((r) => ({ title: [r.first_name, r.last_name], subtitle: r.email }))
  .names({ singular: 'Tenant', plural: 'Tenants' })
  .fields((r) => ({
    iban: r.iban.label('IBAN').format('code'),
    monthly_income: r.monthly_income.help('Gross income per month, checked when the lease was signed.').prefix('€').decimals(2),
  }))
  .list((r) => ({ columns: [r.last_name, r.first_name, r.email, r.phone, r.created_at], sort: [[r.created_at, 'desc']], search: [r.last_name, r.email] }))
  .filters((r, w) => [w.dateRange(r.created_at, { presets: ['30d', '90d', 'year'] })])
  .layout((r) => [
    l.section('Tenant', [r.first_name, r.last_name, r.date_of_birth, r.email, r.phone]),
    l.section('Screening', [r.monthly_income, r.iban], { help: 'Seen by property managers and finance only. Showing the IBAN is logged.' }),
    l.related('Homes', {
      resource: 'leases',
      field: 'id',
      through: { resource: 'lease_tenants', field: 'tenant_id', key: 'lease_id' },
      // Running indefinite leases have no end date, which sorts first
      sort: 'end_date desc, start_date desc',
      columns: ['number', 'unit_id.property_id', 'unit_id', 'start_date', 'end_date', 'monthly_rent'],
      help: 'The properties and units this tenant rents or rented, current leases first.',
      empty: 'This tenant has not signed a lease.',
    }),
  ])
