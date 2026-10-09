import { l, view } from '@protobase/schema'
import type { companies } from './data'

export const companiesView = view<typeof companies>('companies')
  .title((r) => r.name)
  .names({ singular: 'Company', plural: 'Companies' })
  .fields((r) => ({
    name: r.name.help('The registered name, as it should appear on invoices.'),
    status: r.status.help('Leads have not ordered yet; dormant companies have not ordered in a year.').format('badge').valueLabels({ lead: 'Lead', active: 'Active', dormant: 'Dormant' }),
    countryCode: r.countryCode.label('Country'),
    vatNumber: r.vatNumber.label('VAT number').help('Required for invoices to other EU countries.').format('code'),
    createdAt: r.createdAt.label('Created').format('absolute'),
  }))
  .list((r) => ({
    columns: [r.name, r.city, r.countryCode, r.status, r.email, r.phone, r.createdAt],
    search: [r.name],
  }))
  .filters((r, w) => [w.facets(r.status), w.facets(r.countryCode)])
  .layout((r) => [
    l.section('Company', [r.name, r.status, r.city, r.countryCode, r.vatNumber], { help: 'Legal details used on quotes and invoices.' }),
    l.section('Contact', [r.email, r.phone], { help: 'General contact details. People at the company are listed separately.' }),
  ])
