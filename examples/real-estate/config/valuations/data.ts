import { f, resource } from '@protobase/schema'
import { access } from '../roles'

/** portfolio.valuations: a property's value over time. Unique: (property_id, source, valued_on) */
export const valuations = resource('valuations')
  .table('portfolio.valuations')
  .fields({
    id: f.bigint().readOnly().filterable().sortable().dbDefault(),
    organization_id: f.relation('organizations').filterable().sortable(),
    property_id: f.relation('properties').filterable().sortable(),
    valued_on: f.date().filterable().sortable(),
    value: f.decimal({ precision: 14, scale: 2 }),
    source: f.enum(['woz', 'appraisal']).filterable().sortable(),
    created_at: f.timestamp().readOnly().dbDefault(),
    updated_at: f.timestamp().readOnly().dbDefault(),
  })
  .primaryKey((r) => r.id)
  .tenant((r) => r.organization_id)
  .access(access('valuations'))
