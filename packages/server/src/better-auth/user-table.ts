import type { BuiltInTables } from './names/modules'
import type { TableNames } from './names/table-names'

// The user table can be one another system made, such as Supabase's `auth.users`: `auth.users` names it and its
// columns, which become the model's names of the user table, and says what else the store needs to know of it.

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

/** `auth.users`: the user table's options, with its name and the columns named otherwise than Protobase names them. */
export type UserTableSettings = UserTableOptions & {
  /** The table's name, default `user`, for example `users` for Supabase's `auth.users`. */
  table?: string
  /**
   * The columns named otherwise than Protobase names them: `{ role: 'app_role' }`, where `role` holds something else
   * already, such as the Postgres role in Supabase's `auth.users`.
   */
  columns?: Partial<Record<BuiltInTables['user'], string>>
}

/** createAuth's `tables` and `users` for `auth.users`: its table and columns name the store's user table. */
export const userTableOptions = ({ table, columns, ...users }: UserTableSettings = {}): { tables?: TableNames; users: UserTableOptions } => ({
  ...((table !== undefined || columns !== undefined) && { tables: { user: { ...(table !== undefined && { name: table }), ...(columns && { columns }) } } }),
  users,
})

/** The user table's options, from `auth.users`. */
export const userTable = ({ metadata, keyTable, guardedSchemas = [] }: UserTableOptions = {}) => ({ metadata, keyTable, guardedSchemas })

export type UserTable = ReturnType<typeof userTable>

/** Each user field the user metadata column adds; none without one. */
export const metadataField = ({ metadata }: UserTable) => (metadata ? { metadata: { type: 'json', required: false, fieldName: metadata } } as const : undefined)
