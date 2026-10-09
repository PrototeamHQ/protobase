import { f, resource } from '@protobase/schema'
import { access } from '../roles'

/** leasing.leases. Unique: (organization_id, number). Postgres refuses a lease that overlaps another on its unit. */
export const leases = resource('leases')
  .table('leasing.leases')
  .fields({
    id: f.bigint().readOnly().filterable().sortable().dbDefault(),
    organizationId: f.relation('organizations').filterable().sortable(),
    number: f.text().filterable().sortable(),
    unitId: f.relation('units').filterable().sortable(),
    term: f.enum(['indefinite', 'fixed']).default('indefinite').filterable().sortable(),
    startDate: f.date().filterable().sortable(),
    endDate: f.date().optional().filterable().sortable(),
    monthlyRent: f.decimal({ precision: 10, scale: 2 }),
    serviceCosts: f.decimal({ precision: 10, scale: 2 }).default('0'),
    noticeGivenOn: f.date().optional(),
    createdAt: f.timestamp().readOnly().filterable().sortable().dbDefault(),
    updatedAt: f.timestamp().readOnly().dbDefault(),
  })
  .primaryKey((r) => r.id)
  .tenant((r) => r.organizationId)
  .search((r) => [r.number])
  .validate((record) => {
    if (record.term === 'fixed' && !record.endDate) return [{ field: 'endDate', message: 'A fixed-term lease needs an end date.' }]
    if (record.endDate && record.startDate && record.endDate < record.startDate) return [{ field: 'endDate', message: 'The lease cannot end before it starts.' }]
    return undefined
  })
  .access(access('leases'))
