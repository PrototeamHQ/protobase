import { f } from '../fields'
import { resource } from '../resource'

export const invoice = resource('invoice')
  .table('invoices')
  .fields({
    id: f.integer().filterable().sortable(),
    title: f.text().filterable().sortable().alias('headline'),
    notes: f.text(),
    total: f.decimal({ precision: 12, scale: 2 }).filterable().sortable(),
    views: f.bigint().filterable(),
    status: f.enum(['draft', 'paid', 'sent']).filterable(),
    active: f.boolean().filterable(),
    ownerId: f.uuid().filterable(),
    createdAt: f.timestamp().filterable().sortable(),
    day: f.date().filterable(),
    meta: f.json().filterable(),
    currency: f.currency().filterable(),
    country: f.country().filterable(),
    customerId: f.relation('customer').filterable(),
  })
  .primaryKey((r) => r.id)
  .search((r) => [r.title, r.notes])

export const invoiceModel = invoice.toModel()
