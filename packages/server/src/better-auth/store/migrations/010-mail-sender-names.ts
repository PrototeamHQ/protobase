import { ddl } from '../ddl'
import type { StoreMigration } from './migration'

/** The display name of each From address, shown beside it in the From header; NULL when the person entered none. */
export const mailSenderNames: StoreMigration = {
  version: 10,
  name: 'mail_sender_names',
  title: 'The display names of the From addresses people send mail from',
  tables: [],
  statements: ({ table }) => [ddl`alter table ${table('mail_sender')} add column name text`],
}
