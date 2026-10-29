import { sql, type RawBuilder } from 'kysely'
import type { UserColumn } from '../../user-table'
import { storeTable, type StoreNames } from '../store-names'

/** The configured names a migration's statements use, as `ddl` parts. */
export type MigrationNames = {
  /** A table of the store, in its schema. */
  table: (name: string) => RawBuilder<unknown>
  /** What every foreign key to the users points at: the user table, in the store's schema, or `users.keyTable`. */
  user: RawBuilder<unknown>
  /** The user table's own statements, which make it or add its columns: none when it is a view (`users.keyTable`). */
  userDdl: (statements: RawBuilder<unknown>[]) => RawBuilder<unknown>[]
  /** A column of the user table, as `users.columns` names it. */
  userColumn: (name: UserColumn) => string
  /** The user table's JSON metadata column (`users.metadata`), when there is one. */
  metadata: string | undefined
  /** An id column's type and default, before `primary key`. */
  id: RawBuilder<unknown>
  /** The type of a column that holds another table's id. */
  idRef: RawBuilder<unknown>
}

/**
 * One version of the auth store. Once released it never changes: a later change to the store is a migration of its own.
 * Each table it makes is named in `tables`; the user table may be one another system made, such as Supabase's
 * `auth.users`, so it is made only when missing and every column is added only when missing, or a view the app makes
 * itself over another system's, which the statements leave alone.
 */
export type StoreMigration = {
  version: number
  name: string
  /** What it makes, the comment above its statements. */
  title: string
  /** The tables it makes, besides the user table. */
  tables: string[]
  statements: (names: MigrationNames) => RawBuilder<unknown>[]
}

/** The `ddl` parts of the app's names. */
export const migrationNames = (names: StoreNames): MigrationNames => ({
  table: (name) => storeTable(names, name),
  user: names.users.keyTable ? sql.id(names.users.keyTable.schema, names.users.keyTable.table) : storeTable(names, names.users.modelName),
  userDdl: (statements) => (names.users.keyTable ? [] : statements),
  userColumn: names.users.column,
  metadata: names.users.metadata,
  id: sql.raw(names.uuidIds ? 'uuid default pg_catalog.gen_random_uuid()' : 'text'),
  idRef: sql.raw(names.uuidIds ? 'uuid' : 'text'),
})
