import { l, view } from '@protobase/schema'
import type { tickets } from './data'

export const ticketsView = view<typeof tickets>('tickets')
  .title((r) => r.number)
  .names({ singular: 'Ticket', plural: 'Tickets' })
  .nav({
    recent: {
      status: 'priority',
      tones: { urgent: 'danger', high: 'warning', normal: 'info' },
      pulse: ['urgent'],
      filter: 'status = "reported" OR status = "scheduled"',
      orderBy: 'reported_at desc',
    },
  })
  .fields((r) => ({
    number: r.number.format('code'),
    category: r.category.valueLabels({
      heating: 'Heating',
      plumbing: 'Plumbing',
      electrical: 'Electrical',
      leak: 'Leak',
      mould: 'Mould',
      locks: 'Locks',
      appliances: 'Appliances',
      windows_doors: 'Windows & doors',
      garden: 'Garden',
      pests: 'Pests',
    }),
    property_id: r.property_id.label('Property'),
    unit_id: r.unit_id.label('Unit').help('Empty when the whole building is affected.'),
    reported_by: r.reported_by.label('Reported by'),
    assigned_to: r.assigned_to.label('Assigned to').help('The maintenance coordinator who plans the work.'),
    priority: r.priority.format('badge').valueLabels({ low: 'Low', normal: 'Normal', high: 'High', urgent: 'Urgent' }),
    status: r.status.help('Reported, then scheduled once a vendor visit is planned, then done or cancelled.').format('badge')
      .valueLabels({ reported: 'Reported', scheduled: 'Scheduled', done: 'Done', cancelled: 'Cancelled' })
      .valueColors({ cancelled: 'red' }),
    reported_at: r.reported_at.label('Reported'),
    closed_at: r.closed_at.label('Closed'),
  }))
  .list((r) => ({ columns: [r.number, r.title, r.property_id, r.category, r.priority, r.status, r.reported_at], sort: [[r.reported_at, 'desc']], search: [r.number, r.title] }))
  .filters((r, w) => [
    w.facets(r.status),
    w.facets(r.priority),
    w.facets(r.category),
    w.facets(r.assigned_to),
    w.dateRange(r.reported_at, { presets: ['7d', '30d', '90d', 'year'] }),
  ])
  .chart((r) => ({ field: r.reported_at, range: '90d', granularity: 'week' }))
  .layout((r) => [
    l.section('Problem', [r.title, r.description, r.category, r.priority]),
    l.section('Where', [r.property_id, r.unit_id, r.reported_by]),
    l.section('Handling', [r.status, r.assigned_to, r.reported_at, r.closed_at]),
    l.sidebar([r.status, r.priority, r.assigned_to]),
  ])
  .actions((a) => [
    a.update('schedule', { label: 'Mark scheduled', icon: 'calendar', set: { status: 'scheduled' } }),
    a.update('complete', { label: 'Mark done', icon: 'check', set: { status: 'done' }, confirm: 'Close this ticket as done?' }),
    a.update('cancel', { label: 'Cancel', icon: 'x', set: { status: 'cancelled' }, confirm: 'Cancel this ticket?' }),
  ])
