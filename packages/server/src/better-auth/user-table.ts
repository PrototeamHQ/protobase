// The user table can be one another system made, such as Supabase's `auth.users`: `auth.tables.user` names it and
// its columns, and these options say what else the store needs to know of it.

export type UserTableOptions = {
  /** A JSON column that holds each user's metadata, such as `raw_user_meta_data`; none by default. */
  metadata?: string
  /**
   * The table that holds the user ids, when the user table is a view over another system's user table, such as
   * `{ schema: 'auth', table: 'users' }` under a view over Supabase's `auth.users`: the store's migrations then make
   * nothing of the user table, which the app's own migration makes, and every foreign key points at this table.
   */
  keyTable?: { schema: string; table: string }
  /**
   * Schemas the other system that made the user table keeps its sign-in data in, such as `['auth']` for Supabase Auth's
   * identities, sessions, refresh tokens and two-factor secrets: every table in them, today's or one added later,
   * counts among the store's tables. Name only a schema that holds none of the app's own tables.
   */
  guardedSchemas?: string[]
}

/** The user table's options, from `auth.users`. */
export const userTable = ({ metadata, keyTable, guardedSchemas = [] }: UserTableOptions = {}) => ({ metadata, keyTable, guardedSchemas })

export type UserTable = ReturnType<typeof userTable>

/** Each user field the user metadata column adds; none without one. */
export const metadataField = ({ metadata }: UserTable) => (metadata ? { metadata: { type: 'json', required: false, fieldName: metadata } } as const : undefined)
