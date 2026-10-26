import { f, resource } from '@protobase/schema'
import { erpAccess } from '../roles'

/** sales.orders. Unique: (organization_id, number) */
export const orders = resource('orders')
  .table('sales.orders')
  .fields({
    id: f.uuid().readOnly().filterable().sortable().dbDefault(),
    organization_id: f.relation('organizations').filterable().sortable(),
    number: f.text().filterable().sortable(),
    company_id: f.relation('companies').filterable().sortable(),
    person_id: f.relation('people').optional().filterable().sortable(),
    owner_id: f.relation('users').filterable().sortable(),
    status: f.enum(['draft', 'confirmed', 'picking', 'shipped', 'delivered', 'cancelled']).filterable().sortable(),
    currency_code: f.relation('currencies'),
    discount_percent: f.decimal({ precision: 5, scale: 2 }).default('0'),
    total: f.decimal({ precision: 14, scale: 2 }).readOnly().default('0').filterable().sortable(),
    paid: f.boolean().default(false).filterable().sortable(),
    notes: f.text().optional(),
    created_at: f.timestamp().readOnly().filterable().sortable().dbDefault(),
    updated_at: f.timestamp().readOnly().dbDefault(),
  })
  .primaryKey((r) => r.id)
  .tenant((r) => r.organization_id)
  .owner((r) => r.owner_id)
  .search((r) => [r.number])
  .access(erpAccess('orders'))
