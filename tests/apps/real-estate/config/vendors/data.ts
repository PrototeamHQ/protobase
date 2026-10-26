import { f, resource } from '@protobase/schema'
import { access } from '../roles'

/** maintenance.vendors: the contractors who carry out work orders. */
export const vendors = resource('vendors')
  .table('maintenance.vendors')
  .fields({
    id: f.integer().readOnly().filterable().sortable().dbDefault(),
    organization_id: f.relation('organizations').filterable().sortable(),
    name: f.text(),
    trade: f.enum(['plumbing', 'heating', 'electrical', 'roofing', 'carpentry', 'locksmith', 'pest_control', 'general']).filterable().sortable(),
    email: f.text().optional(),
    phone: f.text().optional(),
    hourly_rate: f.decimal({ precision: 8, scale: 2 }),
    active: f.boolean().default(true),
    created_at: f.timestamp().readOnly().dbDefault(),
    updated_at: f.timestamp().readOnly().dbDefault(),
  })
  .primaryKey((r) => r.id)
  .tenant((r) => r.organization_id)
  .access(access('vendors'))
