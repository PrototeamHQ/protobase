import { f, l, resource, view } from '@protobase/schema'

// Records in an order of their own, sorted by hand: the products in the order the shop lists them, sorted on their
// list, and each invoice's items in the order the invoice prints them, sorted on the invoice's page.

export const products = resource('products')
  .table('products')
  .fields({
    id: f.integer().readOnly().filterable().sortable().dbDefault(),
    name: f.text(),
    rank: f.integer().sortable(),
  })
  .primaryKey((r) => r.id)
  .position((r) => r.rank)

export const invoices = resource('invoices')
  .table('invoices')
  .fields({
    id: f.integer().readOnly().filterable().sortable().dbDefault(),
    number: f.text(),
    customer: f.text(),
  })
  .primaryKey((r) => r.id)

export const invoiceItems = resource('invoice_items')
  .table('invoice_items')
  .fields({
    id: f.integer().readOnly().filterable().sortable().dbDefault(),
    invoice_id: f.relation('invoices').filterable(),
    position: f.integer().sortable(),
    description: f.text(),
    amount: f.decimal({ precision: 12, scale: 2 }),
  })
  .primaryKey((r) => r.id)
  .position((r) => r.position, { within: (r) => r.invoice_id })

export const productsView = view<typeof products>('products')
  .title((r) => r.name)
  .list((r) => ({ columns: [r.name], sort: [[r.rank, 'asc']] }))

export const invoicesView = view<typeof invoices>('invoices')
  .title((r) => r.number)
  .layout((r) => [
    l.section('Invoice', [r.number, r.customer]),
    l.related('Items', { resource: 'invoice_items', field: 'invoice_id', sort: 'position' }),
  ])

export const invoiceItemsView = view<typeof invoiceItems>('invoice_items')
  .names({ singular: 'Item', plural: 'Items' })
  .title((r) => r.description)
  .list((r) => ({ columns: [r.description, r.amount], sort: [[r.position, 'asc']] }))
