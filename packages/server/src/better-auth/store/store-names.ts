import type { BetterAuthOptions } from 'better-auth'
import type { ResolvedNames } from '../names/resolve-names'
import type { UserTable } from '../user-table'

// The names in the auth store, read in this one place: its schema, tables and columns (`names`), what else it knows
// of the user table (`users`), and the type of its ids (`generateUserId: 'uuid'`).

export type StoreNames = {
  /** The store's schema; the connection's current one when undefined. */
  schema: string | undefined
  names: ResolvedNames
  users: UserTable
  /** Every id column is a uuid Postgres makes, instead of text. */
  uuidIds: boolean
}

/** What the store's helpers read of an auth instance, or of Better Auth's context: the options' `database`. */
export type StoreOptions = { options: Pick<BetterAuthOptions, 'database'> }

/** The schema the admin store lives in; the search path decides when its options name none. */
export const storeSchema = ({ options: { database } }: StoreOptions): string | undefined => (database && 'schemaName' in database ? database.schemaName : undefined)

/** What `storeNames` reads of the app's auth: its options' `advanced`, its resolved names and its user table's options. */
export type StoreNamesSource = { options: Pick<BetterAuthOptions, 'advanced'>; names: ResolvedNames; users: UserTable }

/** The store's names, from the app's auth. */
export const storeNames = (auth: StoreNamesSource): StoreNames => ({
  schema: auth.names.schema,
  names: auth.names,
  users: auth.users,
  uuidIds: auth.options.advanced?.database?.generateId === 'uuid',
})
