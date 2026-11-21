import { ddl } from '../../ddl'
import type { Step } from '../step'

/** The From addresses people enter for the mailbox they linked, such as their Gmail's send-as aliases. */
export const mailSenders: Step = {
  step: 1,
  version: 9,
  name: 'mail_senders',
  title: 'The From addresses people send mail from through the mailbox they linked',
  tables: ['mail_sender'],
  statements: ({ table, user, id, idRef }) => {
    const sender = table('mail_sender')
    const s = sender.columns
    return [
      ddl`create table ${sender} (
  id ${id} primary key,
  ${s.user_id} ${idRef} not null references ${user} (id) on delete cascade,
  ${s.address} text not null,
  ${s.shared} boolean not null,
  ${s.signature} text,
  ${s.is_default} boolean not null,
  ${s.created_at} timestamptz not null,
  unique (${s.user_id}, ${s.address})
)`,
      ddl`create unique index ${sender.index('mail_sender_default_idx')} on ${sender} (${s.user_id}) where ${s.is_default}`,
      ddl`create index ${sender.index('mail_sender_shared_idx')} on ${sender} (${s.address}) where ${s.shared}`,
    ]
  },
}
