import { f, resource } from '@protobase/schema'
import { erpAccess } from '../roles'

/** sales.orders. Unique: (organization_id, number) */
export const orders = resource('orders')
  .table('sales.orders')
  .fields({
    id: f.uuid().readOnly().filterable().sortable().dbDefault(),
    organizationId: f.relation('organizations').filterable().sortable(),
    number: f.text().filterable().sortable(),
    companyId: f.relation('companies').filterable().sortable(),
    personId: f.relation('people').optional().filterable().sortable(),
    ownerId: f.relation('users').filterable().sortable(),
    status: f.enum(['draft', 'confirmed', 'picking', 'shipped', 'delivered', 'cancelled']).filterable().sortable(),
    currencyCode: f.relation('currencies'),
    discountPercent: f.decimal({ precision: 5, scale: 2 }).default('0'),
    total: f.decimal({ precision: 14, scale: 2 }).readOnly().default('0').filterable().sortable(),
    paid: f.boolean().default(false).filterable().sortable(),
    notes: f.text().optional(),
    createdAt: f.timestamp().readOnly().filterable().sortable().dbDefault(),
    updatedAt: f.timestamp().readOnly().dbDefault(),
  })
  .primaryKey((r) => r.id)
  .tenant((r) => r.organizationId)
  .owner((r) => r.ownerId)
  .search((r) => [r.number])
  .access(erpAccess('orders'))
