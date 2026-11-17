import { ddl } from '../ddl'
import type { StoreMigration } from './migration'

/**
 * The indexes the store's other lookups read by: organizations by creation, as they are paged; passkeys by RP ID, as a
 * sign-in asks which hosts hold one; staff sign-ins by session and newest first; and verifications by the start of
 * their identifier, as the app invitations are listed.
 */
export const lookupIndexes: StoreMigration = {
  version: 13,
  name: 'lookup_indexes',
  title: 'The indexes that page through the organizations and find passkeys, staff sign-ins and app invitations',
  tables: [],
  statements: ({ table }) => [
    ddl`create index organization_created_at_id_idx on ${table('organization')} (created_at, id)`,
    ddl`create index passkey_rp_id_idx on ${table('passkey')} (rp_id)`,
    ddl`create index staff_sign_in_session_id_idx on ${table('staff_sign_in')} (session_id)`,
    ddl`create index staff_sign_in_started_at_idx on ${table('staff_sign_in')} (started_at desc)`,
    ddl`create index verification_identifier_pattern_idx on ${table('verification')} (identifier text_pattern_ops)`,
  ],
}
