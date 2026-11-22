// The versions of the store's former single chain, as `auth_migrations` records them, one row each: every step names
// the one it came from, and the record moves to the steps themselves in a later version. Until then a new step takes
// the next version and goes last here.

/** Each version with the name its row in `auth_migrations` holds. */
export const legacyVersions = [
  { version: 1, name: 'core' },
  { version: 2, name: 'two_factor' },
  { version: 3, name: 'passkeys' },
  { version: 4, name: 'sign_in_policy' },
  { version: 5, name: 'staff_sign_in' },
  { version: 6, name: 'organizations' },
  { version: 7, name: 'mcp' },
  { version: 8, name: 'personal_access_tokens' },
  { version: 9, name: 'mail_senders' },
  { version: 10, name: 'mail_sender_names' },
  { version: 11, name: 'account_keys' },
  { version: 12, name: 'user_indexes' },
  { version: 13, name: 'lookup_indexes' },
  { version: 14, name: 'user_name_search' },
  { version: 15, name: 'mail_sender_checks' },
]

export type LegacyVersion = (typeof legacyVersions)[number]

/** The version the store is at once every step is applied. */
export const latestStoreVersion = legacyVersions.at(-1)!.version
