import { f, resource } from '@protobase/schema'
import { access } from '../roles'

/** portfolio.units: a home that is let on its own. Unique: (property_id, label) */
export const units = resource('units')
  .table('portfolio.units')
  .fields({
    id: f.bigint().readOnly().filterable().sortable().dbDefault(),
    organization_id: f.relation('organizations').filterable().sortable(),
    property_id: f.relation('properties').filterable().sortable(),
    label: f.text(),
    floor: f.integer().default(0),
    bedrooms: f.integer().min(0),
    area_m2: f.integer().min(1).column('area_m2'),
    energy_label: f.enum(['A++++', 'A+++', 'A++', 'A+', 'A', 'B', 'C', 'D', 'E', 'F', 'G']).filterable().sortable(),
    base_rent: f.decimal({ precision: 10, scale: 2 }).filterable().sortable(),
    status: f.enum(['let', 'vacant', 'renovation']).default('vacant').filterable().sortable(),
    created_at: f.timestamp().readOnly().filterable().sortable().dbDefault(),
    updated_at: f.timestamp().readOnly().dbDefault(),
  })
  .primaryKey((r) => r.id)
  .tenant((r) => r.organization_id)
  .search((r) => [r.label])
  .access(access('units'))
