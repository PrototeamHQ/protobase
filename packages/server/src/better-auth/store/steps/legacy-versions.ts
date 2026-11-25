// The versions of the store's former single chain, as its former record of versions held them: every step names the one
// it came from, which maps the versions adopting a store finds onto its steps (`legacy-record.ts`). A new step takes the
// next version and goes last here.

/** Each version with its name. */
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
  { version: 15, name: 'sender_address_evidence' },
  { version: 16, name: 'sender_verifications' },
  { version: 17, name: 'sender_sharing' },
  { version: 18, name: 'default_organization' },
  { version: 19, name: 'drop_version_record' },
]

export type LegacyVersion = (typeof legacyVersions)[number]

/** The version the store is at once every step is applied. */
export const latestStoreVersion = legacyVersions.at(-1)!.version
