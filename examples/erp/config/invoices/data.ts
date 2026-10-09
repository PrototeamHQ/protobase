import { f, resource } from '@protobase/schema'
import { erpAccess } from '../roles'

/** sales.invoices. Unique: (organization_id, number) */
export const invoices = resource('invoices')
  .table('sales.invoices')
  .fields({
    id: f.bigint().readOnly().filterable().sortable().dbDefault(),
    organizationId: f.relation('organizations').filterable().sortable(),
    number: f.text().filterable().sortable(),
    orderId: f.relation('orders').optional().filterable().sortable(),
    companyId: f.relation('companies').filterable().sortable(),
    status: f.enum(['draft', 'sent', 'paid', 'overdue']).default('draft').filterable().sortable(),
    issuedAt: f.date().filterable().sortable(),
    dueAt: f.date(),
    vatRate: f.decimal({ precision: 4, scale: 2 }).default('21'),
    subtotal: f.decimal({ precision: 14, scale: 2 }).readOnly().default('0'),
    vat: f.decimal({ precision: 14, scale: 2 }).readOnly().default('0'),
    total: f.decimal({ precision: 14, scale: 2 }).readOnly().default('0'),
    createdAt: f.timestamp().readOnly().filterable().sortable().dbDefault(),
    updatedAt: f.timestamp().readOnly().dbDefault(),
  })
  .primaryKey((r) => r.id)
  .tenant((r) => r.organizationId)
  .search((r) => [r.number])
  .access(erpAccess('invoices'))
