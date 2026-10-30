import { l, view } from '@protobase/schema'
import type { invoices } from './data'

export const invoicesView = view<typeof invoices>('invoices')
  .title((r) => r.number)
  .names({ singular: 'Invoice', plural: 'Invoices' })
  .nav({ recent: { status: 'status', tones: { draft: 'neutral', sent: 'info', overdue: 'danger' }, filter: 'status != "paid"', orderBy: 'issued_at desc', limit: 3 } })
  .fields((r) => ({
    number: r.number.help('Assigned when the invoice is created.').format('code'),
    company_id: r.company_id.label('Customer').help('The company that receives the invoice.'),
    order_id: r.order_id.label('Order').help('The sales order this invoice bills, if any.'),
    status: r.status.help('Sent invoices are emailed to the customer; overdue ones trigger reminders.').format('badge')
      .valueLabels({ draft: 'Draft', sent: 'Sent', paid: 'Paid', overdue: 'Overdue' })
      .valueColors({ sent: 'blue', paid: 'green', overdue: 'red' }),
    issued_at: r.issued_at.label('Issue date').help('The date printed on the invoice.'),
    due_at: r.due_at.label('Due date').help('Usually the issue date plus the payment terms.'),
    vat_rate: r.vat_rate.label('VAT rate').help('Percentage added to the subtotal.').format('percent'),
    subtotal: r.subtotal.prefix('€').currency('EUR').decimals(2),
    vat: r.vat.label('VAT').prefix('€').currency('EUR').decimals(2),
    total: r.total.help('Subtotal plus VAT.').prefix('€').currency('EUR').decimals(2),
  }))
  .list((r) => ({
    columns: [r.number, r.company_id, r.status, r.issued_at, r.due_at, r.total],
    search: [r.number],
  }))
  .filters((r, w) => [w.facets(r.status), w.dateRange(r.issued_at, { presets: ['30d', '90d', 'quarter', 'year'] })])
  .layout((r) => [
    l.section('Billing details', [r.company_id, r.order_id, r.status, r.issued_at, r.due_at], {
      help: 'Who is being billed and when payment is due. Changes are saved when you press Save.',
    }),
    l.section('Totals', [r.vat_rate, r.subtotal, r.vat, r.total], {
      help: 'Calculated from the invoice lines. The VAT rate applies to the whole invoice.',
    }),
    l.sidebar([r.status, r.total]),
  ])
  .saveFeedback('button')
  .actions((a) => [
    a.action('send', { label: 'Send to customer', icon: 'send', confirm: 'Email the PDF to the customer and mark the invoice as sent?' }),
    a.update('recordPayment', { label: 'Record payment', icon: 'wallet', set: { status: 'paid' } }),
  ])
