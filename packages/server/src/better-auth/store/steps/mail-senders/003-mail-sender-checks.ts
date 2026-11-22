import { ddl } from '../../ddl'
import type { Step } from '../step'

/**
 * Whether a check proved each From address: `verified_account_id`, the mailbox account a check's test message arrived
 * from the address through, NULL until one did and again once that account goes, with `verified_at`, when; and the
 * check waiting for its result, `check_token`, a hash of its token, through `check_account_id`.
 */
export const mailSenderChecks: Step = {
  step: 3,
  version: 15,
  name: 'mail_sender_checks',
  title: 'Which From addresses a check proved, and through which mailbox',
  tables: [],
  statements: ({ table, idRef }) => {
    const sender = table('mail_sender')
    const account = table('account')
    const s = sender.columns
    return [
      ddl`alter table ${sender} add column ${s.verified_at} timestamptz`,
      ddl`alter table ${sender} add column ${s.verified_account_id} ${idRef} references ${account} (id) on delete set null`,
      ddl`alter table ${sender} add column ${s.check_token} text`,
      ddl`alter table ${sender} add column ${s.check_account_id} ${idRef} references ${account} (id) on delete set null`,
    ]
  },
}
