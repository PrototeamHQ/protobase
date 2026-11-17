import { sql } from 'kysely'
import type { BetterAuthOptions } from 'better-auth'
import type { UserTable } from '../user-table'

// The names the app configures in the auth store, read in this one place: its schema, the user table and its columns
// (`users`), and the type of its ids (`generateUserId: 'uuid'`). Every other table and column has a fixed name, which
// the migrations spell out.

export type StoreNames = {
  /** The store's schema; the connection's current one when undefined. */
  schema: string | undefined
  users: Pick<UserTable, 'modelName' | 'column' | 'metadata' | 'keyTable' | 'guardedSchemas'>
  /** Every id column is a uuid Postgres makes, instead of text. */
  uuidIds: boolean
}

/** What the store's helpers read of an auth instance, or of Better Auth's context: the options' `database`. */
export type StoreOptions = { options: Pick<BetterAuthOptions, 'database'> }

/** The schema the admin store lives in; the search path decides when its options name none. */
export const storeSchema = ({ options: { database } }: StoreOptions): string | undefined => (database && 'schemaName' in database ? database.schemaName : undefined)

/** What `storeNames` reads of the app's auth: its options' `database` and `advanced`, and its user table. */
export type StoreNamesSource = { options: Pick<BetterAuthOptions, 'database' | 'advanced'>; userTable: StoreNames['users'] }

/** The store's configured names, from the app's auth. */
export const storeNames = (auth: StoreNamesSource): StoreNames => ({
  schema: storeSchema(auth),
  users: auth.userTable,
  uuidIds: auth.options.advanced?.database?.generateId === 'uuid',
})

/** A table of the store, in its schema, as an identifier for `ddl`. */
export const storeTable = ({ schema }: Pick<StoreNames, 'schema'>, name: string) => (schema === undefined ? sql.id(name) : sql.id(schema, name))
