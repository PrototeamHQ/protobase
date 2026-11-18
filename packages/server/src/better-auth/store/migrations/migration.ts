import { sql, type RawBuilder } from 'kysely'
import { tableId, type TableId } from '../../names/identifiers'
import type { ResolvedNames } from '../../names/resolve-names'
import type { StoreNames } from '../store-names'

/** The names a migration's statements use, as `ddl` parts. */
export type MigrationNames = {
  /** A table of the store, by internal name, in its schema, with its columns and indexes as the store's names resolve them. */
  table: ResolvedNames['table']
  /** What every foreign key to the users points at: the user table, in the store's schema, or `users.keyTable`. */
  user: TableId
  /** The user table's own statements, which make it or add its columns: none when it is a view (`users.keyTable`). */
  userDdl: (statements: RawBuilder<unknown>[]) => RawBuilder<unknown>[]
  /** The user table's JSON metadata column (`users.metadata`), when there is one. */
  metadata: string | undefined
  /** An id column's type and default, before `primary key`. */
  id: RawBuilder<unknown>
  /** The type of a column that holds another table's id. */
  idRef: RawBuilder<unknown>
}

/**
 * One version of the auth store. Once released its statements never change, only the names they are written with: a
 * later change to the store is a migration of its own. Each table it makes is named in `tables`; the user table may be
 * one another system made, such as Supabase's `auth.users`, so it is made only when missing and every column is added
 * only when missing, or a view the app makes itself over another system's, which the statements leave alone.
 */
export type StoreMigration = {
  version: number
  name: string
  /** What it makes, the comment above its statements. */
  title: string
  /** The tables it makes, besides the user table, by internal name. */
  tables: string[]
  statements: (names: MigrationNames) => RawBuilder<unknown>[]
}

/** The `ddl` parts of the store's names. */
export const migrationNames = ({ names, users, uuidIds }: StoreNames): MigrationNames => ({
  table: names.table,
  user: users.keyTable ? tableId(users.keyTable.schema, users.keyTable.table) : names.table('user'),
  userDdl: (statements) => (users.keyTable ? [] : statements),
  metadata: users.metadata,
  id: sql.raw(uuidIds ? 'uuid default pg_catalog.gen_random_uuid()' : 'text'),
  idRef: sql.raw(uuidIds ? 'uuid' : 'text'),
})
