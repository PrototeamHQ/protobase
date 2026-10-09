import { f, resource } from '@protobase/schema'
import { access } from '../roles'

/** portfolio.valuations: a property's value over time. Unique: (property_id, source, valued_on) */
export const valuations = resource('valuations')
  .table('portfolio.valuations')
  .fields({
    id: f.bigint().readOnly().filterable().sortable().dbDefault(),
    organizationId: f.relation('organizations').filterable().sortable(),
    propertyId: f.relation('properties').filterable().sortable(),
    valuedOn: f.date().filterable().sortable(),
    value: f.decimal({ precision: 14, scale: 2 }),
    source: f.enum(['woz', 'appraisal']).filterable().sortable(),
    createdAt: f.timestamp().readOnly().dbDefault(),
    updatedAt: f.timestamp().readOnly().dbDefault(),
  })
  .primaryKey((r) => r.id)
  .tenant((r) => r.organizationId)
  .access(access('valuations'))
