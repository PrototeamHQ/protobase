import { f, l, resource, view } from '@protobase/schema'

// A helpdesk's tickets, which everyone who may read one can comment on, mentioning colleagues who may read it too.

/** support.tickets */
export const tickets = resource('tickets')
  .table('support.tickets')
  .fields({
    id: f.integer().readOnly().filterable().sortable(),
    title: f.text(),
    status: f.enum(['open', 'waiting', 'closed']).default('open'),
  })
  .primaryKey((r) => r.id)
  .comments()

export const ticketsView = view<typeof tickets>('tickets')
  .names({ singular: 'Ticket', plural: 'Tickets' })
  .title((r) => r.title)
  .layout((r) => [
    l.section('Ticket', [r.title, r.status]),
    // oldest first, the newest just above the box to write one
    l.comments(),
  ])
