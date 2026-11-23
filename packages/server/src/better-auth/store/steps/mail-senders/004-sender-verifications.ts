import { ddl } from '../../ddl'
import type { Step } from '../step'

/**
 * The verifications the app's verifiers run on From addresses: one row per attempt, `pending` until it settles
 * `verified` or `failed`, at most one pending per address and verifier. It keeps only its secret's SHA-256.
 */
export const senderVerifications: Step = {
  step: 4,
  version: 16,
  name: 'sender_verifications',
  title: "The verifications the app's verifiers run on From addresses",
  tables: ['mail_sender_verification'],
  statements: ({ table, id, idRef }) => {
    const verification = table('mail_sender_verification')
    const v = verification.columns
    const sender = table('mail_sender')
    return [
      ddl`create table ${verification} (
  id ${id} primary key,
  ${v.sender_id} ${idRef} not null references ${sender} (id) on delete cascade,
  ${v.verifier} text not null,
  ${v.state} text not null check (${v.state} in ('pending', 'verified', 'failed')),
  ${v.secret_hash} text not null,
  ${v.created_at} timestamptz not null,
  ${v.expires_at} timestamptz not null,
  ${v.next_check_at} timestamptz not null,
  ${v.settled_at} timestamptz,
  ${v.valid_until} timestamptz,
  ${v.error_code} text,
  ${v.error} text check (char_length(${v.error}) <= 500)
)`,
      ddl`create unique index ${verification.index('mail_sender_verification_pending_uidx')} on ${verification} (${v.sender_id}, ${v.verifier}) where ${v.state} = 'pending'`,
      ddl`create unique index ${verification.index('mail_sender_verification_secret_uidx')} on ${verification} (${v.secret_hash})`,
      ddl`create index ${verification.index('mail_sender_verification_due_idx')} on ${verification} (${v.next_check_at}) where ${v.state} = 'pending'`,
      ddl`create index ${verification.index('mail_sender_verification_expiry_idx')} on ${verification} (${v.expires_at}) where ${v.state} = 'pending'`,
      ddl`create index ${verification.index('mail_sender_verification_sender_idx')} on ${verification} (${v.sender_id}, ${v.verifier}, ${v.created_at})`,
    ]
  },
}
