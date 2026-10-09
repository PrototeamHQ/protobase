import { view } from '@protobase/schema'
import type { orders } from './data'

export const ordersView = view<typeof orders>('orders')
  .title((r) => r.number)
  .names({ singular: 'Order', plural: 'Orders' })
  .nav({
    recent: {
      status: 'status',
      tones: { draft: 'neutral', confirmed: 'info', picking: 'warning', shipped: 'success' },
      pulse: ['picking'],
      filter: 'status != "delivered" AND status != "cancelled"',
      orderBy: 'createdAt desc',
    },
  })
  .fields((r) => ({
    status: r.status.help('Where the order is in its life. Moving it forward can notify the customer.').format('badge')
      .valueLabels({ draft: 'Draft', confirmed: 'Confirmed', picking: 'Picking', shipped: 'Shipped', delivered: 'Delivered', cancelled: 'Cancelled' }),
    total: r.total.help('Order total including VAT.').prefix('€').decimals(2),
    discountPercent: r.discountPercent.label('Discount').help('Percentage taken off the order total.').format('percent'),
    paid: r.paid.help('Set when the payment has been received.'),
    createdAt: r.createdAt.label('Created').format('absolute'),
  }))
  .list((r) => ({
    columns: [r.number, r.companyId, r.status, r.total, r.discountPercent, r.paid, r.ownerId, r.createdAt],
    sort: [[r.createdAt, 'desc']],
    search: [r.number],
  }))
  .filters((r, w) => [
    w.facets(r.status),
    w.facets(r.ownerId),
    w.dateRange(r.createdAt, { presets: ['7d', '30d', '90d', 'quarter', 'year'] }),
    w.range(r.total, { histogram: true }),
    w.toggle(r.paid),
  ])
  .chart((r) => ({ field: r.createdAt, range: '30d', granularity: 'day' }))
  .saveFeedback('toast')
  .actions((a) => [
    a.update('markPaid', { label: 'Mark as paid', icon: 'wallet', set: { paid: true }, confirm: 'Record that the customer paid this order?' }),
    a.action('createInvoice', { label: 'Create invoice', icon: 'file-text' }),
  ])
