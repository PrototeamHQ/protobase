import { f, resource } from '@protobase/schema'
import { access } from '../roles'

/** portfolio.units: a home that is let on its own. Unique: (property_id, label) */
export const units = resource('units')
  .table('portfolio.units')
  .fields({
    id: f.bigint().readOnly().filterable().sortable().dbDefault(),
    organizationId: f.relation('organizations').filterable().sortable(),
    propertyId: f.relation('properties').filterable().sortable(),
    label: f.text(),
    floor: f.integer().default(0),
    bedrooms: f.integer().min(0),
    areaM2: f.integer().min(1).column('area_m2'),
    energyLabel: f.enum(['A++++', 'A+++', 'A++', 'A+', 'A', 'B', 'C', 'D', 'E', 'F', 'G']).filterable().sortable(),
    baseRent: f.decimal({ precision: 10, scale: 2 }).filterable().sortable(),
    status: f.enum(['let', 'vacant', 'renovation']).default('vacant').filterable().sortable(),
    createdAt: f.timestamp().readOnly().filterable().sortable().dbDefault(),
    updatedAt: f.timestamp().readOnly().dbDefault(),
  })
  .primaryKey((r) => r.id)
  .tenant((r) => r.organizationId)
  .search((r) => [r.label])
  .access(access('units'))
