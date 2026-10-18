import { f, l, resource, view } from '@protobase/schema'

// A helpdesk's tickets: a job sums each one up after it is written, and agents ask the model for a priority or a translation.

/** support.tickets */
export const tickets = resource('tickets')
  .table('support.tickets')
  .fields({
    id: f.integer().readOnly().filterable().sortable(),
    title: f.text(),
    description: f.text().optional(),
    priority: f.enum(['low', 'normal', 'urgent']).optional(),
    // empty until the job fills it, after a create and after a change of the title or description
    summary: f.text().optional().ai({ prompt: 'Summarise this support ticket in one sentence.\n\nTitle: {title}\n\n{description}' }),
  })
  .primaryKey((r) => r.id)

export const ticketsView = view<typeof tickets>('tickets')
  .names({ singular: 'Ticket', plural: 'Tickets' })
  .title((r) => r.title)
  .layout((r) => [l.section('Ticket', [r.title, r.description, r.priority, r.summary])])
  .actions((a) => [
    a.ai('translate', { label: 'Translate to English', icon: 'file-text', prompt: 'Translate into English:\n\n{description}', writes: 'description' }),
    a.ai('triage', { label: 'Suggest priority', icon: 'tag', prompt: 'How urgent is this support ticket?\n\n{title}\n{description}', writes: 'priority', confirm: 'Replace the priority?' }),
  ])
