import { ddl } from '../../ddl'
import type { Step } from '../step'

/**
 * When the owner of each From address shared it with the app's other senders, NULL while it is theirs alone. It takes
 * the place of `shared`, which nothing writes from this version on, so it may be NULL; a later step drops it.
 */
export const senderSharing: Step = {
  step: 5,
  version: 17,
  name: 'sender_sharing',
  title: "When the owner of each From address shared it with the app's other senders",
  tables: [],
  statements: ({ table }) => {
    const sender = table('mail_sender')
    const s = sender.columns
    return [
      ddl`alter table ${sender} add column ${s.shared_at} timestamptz`,
      ddl`alter table ${sender} alter column ${s.shared} drop not null`,
      ddl`create index ${sender.index('mail_sender_shared_at_idx')} on ${sender} (${s.user_id}) where ${s.shared_at} is not null`,
    ]
  },
}
