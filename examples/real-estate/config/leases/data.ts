import { f, resource } from '@protobase/schema'
import { access } from '../roles'

/** leasing.leases. Unique: (organization_id, number). Postgres refuses a lease that overlaps another on its unit. */
export const leases = resource('leases')
  .table('leasing.leases')
  .fields({
    id: f.bigint().readOnly().filterable().sortable().dbDefault(),
    organization_id: f.relation('organizations').filterable().sortable(),
    number: f.text().filterable().sortable(),
    unit_id: f.relation('units').filterable().sortable(),
    term: f.enum(['indefinite', 'fixed']).default('indefinite').filterable().sortable(),
    start_date: f.date().filterable().sortable(),
    end_date: f.date().optional().filterable().sortable(),
    monthly_rent: f.decimal({ precision: 10, scale: 2 }),
    service_costs: f.decimal({ precision: 10, scale: 2 }).default('0'),
    notice_given_on: f.date().optional(),
    created_at: f.timestamp().readOnly().filterable().sortable().dbDefault(),
    updated_at: f.timestamp().readOnly().dbDefault(),
  })
  .primaryKey((r) => r.id)
  .tenant((r) => r.organization_id)
  .search((r) => [r.number])
  .validate((record) => {
    if (record.term === 'fixed' && !record.end_date) return [{ field: 'end_date', message: 'A fixed-term lease needs an end date.' }]
    if (record.end_date && record.start_date && record.end_date < record.start_date) return [{ field: 'end_date', message: 'The lease cannot end before it starts.' }]
    return undefined
  })
  .access(access('leases'))
