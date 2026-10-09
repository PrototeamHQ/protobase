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
      orderBy: 'reportedAt desc',
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
    propertyId: r.propertyId.label('Property'),
    unitId: r.unitId.label('Unit').help('Empty when the whole building is affected.'),
    reportedBy: r.reportedBy.label('Reported by'),
    assignedTo: r.assignedTo.label('Assigned to').help('The maintenance coordinator who plans the work.'),
    priority: r.priority.format('badge').valueLabels({ low: 'Low', normal: 'Normal', high: 'High', urgent: 'Urgent' }),
    status: r.status.help('Reported, then scheduled once a vendor visit is planned, then done or cancelled.').format('badge').valueLabels({ reported: 'Reported', scheduled: 'Scheduled', done: 'Done', cancelled: 'Cancelled' }),
    reportedAt: r.reportedAt.label('Reported'),
    closedAt: r.closedAt.label('Closed'),
  }))
  .list((r) => ({ columns: [r.number, r.title, r.propertyId, r.category, r.priority, r.status, r.reportedAt], sort: [[r.reportedAt, 'desc']], search: [r.number, r.title] }))
  .filters((r, w) => [
    w.facets(r.status),
    w.facets(r.priority),
    w.facets(r.category),
    w.facets(r.assignedTo),
    w.dateRange(r.reportedAt, { presets: ['7d', '30d', '90d', 'year'] }),
  ])
  .chart((r) => ({ field: r.reportedAt, range: '90d', granularity: 'week' }))
  .layout((r) => [
    l.section('Problem', [r.title, r.description, r.category, r.priority]),
    l.section('Where', [r.propertyId, r.unitId, r.reportedBy]),
    l.section('Handling', [r.status, r.assignedTo, r.reportedAt, r.closedAt]),
    l.sidebar([r.status, r.priority, r.assignedTo]),
  ])
  .actions((a) => [
    a.update('schedule', { label: 'Mark scheduled', icon: 'calendar', set: { status: 'scheduled' } }),
    a.update('complete', { label: 'Mark done', icon: 'check', set: { status: 'done' }, confirm: 'Close this ticket as done?' }),
    a.update('cancel', { label: 'Cancel', icon: 'x', set: { status: 'cancelled' }, confirm: 'Cancel this ticket?' }),
  ])
