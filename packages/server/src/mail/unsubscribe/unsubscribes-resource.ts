import { f, l, resource, view, type AccessContext } from '@protobase/schema'
import { unsubscribesTable } from './unsubscribe-store'

const admins = ({ user }: AccessContext) => user?.roles?.includes('admin') ?? false

/**
 * Who unsubscribed from which topic of the app's bulk mail, over its table: the admin app lists them as Unsubscribes,
 * and the app's code reads them through the API. Admins only, whatever the project's roles say; nobody writes them but
 * the unsubscribe link.
 */
export const unsubscribesResource = resource('mail_unsubscribes')
  .table(unsubscribesTable)
  .fields({
    id: f.bigint().readOnly(),
    recipient: f.text().readOnly().filterable(),
    topic: f.text().readOnly().filterable(),
    created_at: f.timestamp().readOnly().sortable(),
  })
  .primaryKey((r) => r.id)
  .access({ list: admins, read: admins, create: () => false, update: () => false, delete: () => false })

export const unsubscribesView = view<typeof unsubscribesResource>('mail_unsubscribes')
  .names({ singular: 'Unsubscribe', plural: 'Unsubscribes' })
  .icon('mail-x')
  .title((r) => r.recipient)
  .help('Everyone who unsubscribed from a topic of the bulk mail, newest first. Bulk mail of that topic is not sent to them.')
  .fields((r) => ({
    recipient: r.recipient.label('Recipient'),
    topic: r.topic.label('Topic'),
    created_at: r.created_at.label('Unsubscribed'),
  }))
  .list((r) => ({ columns: [r.recipient, r.topic, r.created_at], sort: [[r.created_at, 'desc']] }))
  .layout((r) => [l.section('Unsubscribe', [r.recipient, r.topic, r.created_at])])
