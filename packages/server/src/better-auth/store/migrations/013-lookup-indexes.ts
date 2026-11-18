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
  statements: ({ table }) => {
    const organization = table('organization')
    const passkey = table('passkey')
    const staff = table('staff_sign_in')
    const verification = table('verification')
    return [
      ddl`create index ${organization.index('organization_created_at_id_idx')} on ${organization} (${organization.columns.created_at}, id)`,
      ddl`create index ${passkey.index('passkey_rp_id_idx')} on ${passkey} (${passkey.columns.rp_id})`,
      ddl`create index ${staff.index('staff_sign_in_session_id_idx')} on ${staff} (${staff.columns.session_id})`,
      ddl`create index ${staff.index('staff_sign_in_started_at_idx')} on ${staff} (${staff.columns.started_at} desc)`,
      ddl`create index ${verification.index('verification_identifier_pattern_idx')} on ${verification} (${verification.columns.identifier} text_pattern_ops)`,
    ]
  },
}
