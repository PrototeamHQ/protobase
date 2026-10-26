import { f, resource } from '@protobase/schema'
import { erpAccess } from '../roles'

/** sales.invoice_lines. Unique: (invoice_id, position) */
export const invoiceLines = resource('invoice_lines')
  .table('sales.invoice_lines')
  .fields({
    id: f.bigint().readOnly().filterable().sortable().dbDefault(),
    invoice_id: f.relation('invoices').filterable().sortable(),
    organization_id: f.relation('organizations').filterable().sortable(),
    position: f.integer().sortable(),
    product_id: f.relation('products').optional().filterable().sortable(),
    description: f.text(),
    quantity: f.integer(),
    unit_price: f.decimal({ precision: 12, scale: 2 }),
    line_total: f.decimal({ precision: 14, scale: 2 }).optional().readOnly(),
    created_at: f.timestamp().readOnly().dbDefault(),
    updated_at: f.timestamp().readOnly().dbDefault(),
  })
  .primaryKey((r) => r.id)
  .tenant((r) => r.organization_id)
  .position((r) => r.position, { within: (r) => r.invoice_id })
  .access(erpAccess('invoice_lines'))
