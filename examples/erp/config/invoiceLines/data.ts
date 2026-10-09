import { f, resource } from '@protobase/schema'
import { erpAccess } from '../roles'

/** sales.invoice_lines. Unique: (invoice_id, position) */
export const invoiceLines = resource('invoiceLines')
  .table('sales.invoice_lines')
  .fields({
    id: f.bigint().readOnly().filterable().sortable().dbDefault(),
    invoiceId: f.relation('invoices').filterable().sortable(),
    organizationId: f.relation('organizations').filterable().sortable(),
    position: f.integer().sortable(),
    productId: f.relation('products').optional().filterable().sortable(),
    description: f.text(),
    quantity: f.integer(),
    unitPrice: f.decimal({ precision: 12, scale: 2 }),
    lineTotal: f.decimal({ precision: 14, scale: 2 }).optional().readOnly(),
    createdAt: f.timestamp().readOnly().dbDefault(),
    updatedAt: f.timestamp().readOnly().dbDefault(),
  })
  .primaryKey((r) => r.id)
  .tenant((r) => r.organizationId)
  .access(erpAccess('invoiceLines'))
