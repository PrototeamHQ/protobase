import { ddl } from '../../ddl'
import type { Step } from '../step'

/** The display name of each From address, shown beside it in the From header; NULL when the person entered none. */
export const mailSenderNames: Step = {
  step: 2,
  version: 10,
  name: 'mail_sender_names',
  title: 'The display names of the From addresses people send mail from',
  tables: [],
  statements: ({ table }) => [ddl`alter table ${table('mail_sender')} add column ${table('mail_sender').columns.name} text`],
}
