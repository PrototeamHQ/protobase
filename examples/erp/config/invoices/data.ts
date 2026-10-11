import { f, resource } from '@protobase/schema'
import { erpAccess } from '../roles'

/** sales.invoices. Unique: (organization_id, number) */
export const invoices = resource('invoices')
  .table('sales.invoices')
  .fields({
    id: f.bigint().readOnly().filterable().sortable().dbDefault(),
    organization_id: f.relation('organizations').filterable().sortable(),
    number: f.text().filterable().sortable(),
    order_id: f.relation('orders').optional().filterable().sortable(),
    company_id: f.relation('companies').filterable().sortable(),
    status: f.enum(['draft', 'sent', 'paid', 'overdue']).default('draft').filterable().sortable(),
    issued_at: f.date().filterable().sortable(),
    due_at: f.date(),
    vat_rate: f.decimal({ precision: 4, scale: 2 }).default('21'),
    subtotal: f.decimal({ precision: 14, scale: 2 }).readOnly().default('0'),
    vat: f.decimal({ precision: 14, scale: 2 }).readOnly().default('0'),
    total: f.decimal({ precision: 14, scale: 2 }).readOnly().default('0'),
    created_at: f.timestamp().readOnly().filterable().sortable().dbDefault(),
    updated_at: f.timestamp().readOnly().dbDefault(),
  })
  .primaryKey((r) => r.id)
  .tenant((r) => r.organization_id)
  .search((r) => [r.number])
  .access(erpAccess('invoices'))
