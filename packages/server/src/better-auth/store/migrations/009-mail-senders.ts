import { ddl } from '../ddl'
import type { StoreMigration } from './migration'

/** The From addresses people enter for the mailbox they linked, such as their Gmail's send-as aliases. */
export const mailSenders: StoreMigration = {
  version: 9,
  name: 'mail_senders',
  title: 'The From addresses people send mail from through the mailbox they linked',
  tables: ['mail_sender'],
  statements: ({ table, user, id, idRef }) => [
    ddl`create table ${table('mail_sender')} (
  id ${id} primary key,
  user_id ${idRef} not null references ${user} (id) on delete cascade,
  address text not null,
  shared boolean not null,
  signature text,
  is_default boolean not null,
  created_at timestamptz not null,
  unique (user_id, address)
)`,
    ddl`create unique index mail_sender_default_idx on ${table('mail_sender')} (user_id) where is_default`,
    ddl`create index mail_sender_shared_idx on ${table('mail_sender')} (address) where shared`,
  ],
}
