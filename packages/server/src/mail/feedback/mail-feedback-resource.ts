import { f, l, resource, view, type AccessContext } from '@protobase/schema'
import { bounceTypes, feedbackTypes } from './feedback-record'
import { feedbackTable } from './feedback-store'

const admins = ({ user }: AccessContext) => user?.roles?.includes('admin') ?? false

/**
 * The bounces and spam complaints of the mail the app sends, over its table, with the events `mail_feedback.bounced`
 * and `mail_feedback.complained` that workflows, hooks and webhooks act on. Admins only, whatever the project's roles
 * say; nobody writes them but the feedback endpoints. Protobase suppresses no mail on them: the app decides.
 */
export const mailFeedbackResource = resource('mail_feedback')
  .table(feedbackTable)
  .fields({
    id: f.bigint().readOnly(),
    type: f.enum(feedbackTypes).readOnly().filterable(),
    bounce_type: f.enum(bounceTypes).optional().readOnly(),
    recipient: f.text().readOnly().filterable(),
    message_id: f.text().optional().readOnly().filterable(),
    provider_message_id: f.text().optional().readOnly().filterable(),
    reason: f.text().optional().readOnly(),
    provider: f.text().readOnly(),
    event_id: f.text().readOnly(),
    occurred_at: f.timestamp().optional().readOnly(),
    created_at: f.timestamp().readOnly().sortable(),
  })
  .primaryKey((r) => r.id)
  .access({ list: admins, read: admins, create: () => false, update: () => false, delete: () => false })
  .events((e) => [e.created('bounced', { when: 'type = "bounce"' }), e.created('complained', { when: 'type = "complaint"' })])

export const mailFeedbackView = view<typeof mailFeedbackResource>('mail_feedback')
  .names({ singular: 'Mail feedback', plural: 'Mail feedback' })
  .icon('mail-warning')
  .title((r) => r.recipient)
  .help('Every bounce and spam complaint a mail provider reported for the mail the app sends, newest first. Protobase sends on regardless: the app decides what to do.')
  .fields((r) => ({
    type: r.type.label('Type').valueLabels({ bounce: 'Bounce', complaint: 'Complaint' }),
    bounce_type: r.bounce_type.label('Bounce').valueLabels({ hard: 'Hard', soft: 'Soft' }),
    recipient: r.recipient.label('Recipient'),
    message_id: r.message_id.label('Message-ID'),
    provider_message_id: r.provider_message_id.label("Provider's message id"),
    reason: r.reason.label('Reason'),
    provider: r.provider.label('Provider'),
    event_id: r.event_id.label("Provider's report id"),
    occurred_at: r.occurred_at.label('Happened'),
    created_at: r.created_at.label('Received'),
  }))
  .list((r) => ({ columns: [r.recipient, r.type, r.bounce_type, r.reason, r.created_at], sort: [[r.created_at, 'desc']] }))
  .layout((r) => [
    l.section('Feedback', [r.recipient, r.type, r.bounce_type, r.reason, r.occurred_at, r.created_at]),
    l.section('Message', [r.message_id, r.provider_message_id, r.provider, r.event_id]),
  ])
