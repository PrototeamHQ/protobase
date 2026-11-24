import { sql, type RawBuilder } from 'kysely'
import { tableId, type TableId } from '../../names/identifiers'
import type { ModuleId } from '../../names/modules'
import type { ResolvedNames } from '../../names/resolve-names'
import type { StoreNames } from '../store-names'

/** The names a step's statements use, as `ddl` parts. */
export type MigrationNames = {
  /** A table of a module that is on, by internal name, in its schema, with its columns and indexes as the store's names resolve them. */
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

type Statements = (names: MigrationNames) => RawBuilder<unknown>[]

/**
 * One step of a module's chain, numbered from 1 within its module. Once released its statements never change, only the
 * names they are written with: a later change to the module's tables is a step of its own, with the next number. Each
 * table it makes is named in `tables`; the user table may be one another system made, such as Supabase's `auth.users`,
 * so it is made only when missing and every column is added only when missing, or a view the app makes itself over
 * another system's, which the statements leave alone.
 *
 * A step only adds: a table, a nullable column, an index, or a column whose default or fill comes from data already
 * there (`step-lint.ts`). One that assumes something of the rows already there, such as a unique index over them, holds
 * a `check` that refuses before anything changes.
 */
export type Step = {
  step: number
  name: string
  /** What it makes, the comment above its statements. */
  title: string
  /**
   * The version of the store's former single chain this step came from, as `auth_migrations` recorded it, which fills
   * `auth_steps` for a store that recorded versions: a new step takes the next version after the latest
   * (`legacy-versions.ts`), which no store recorded.
   */
  version: number
  /** The tables it makes, besides the user table, by internal name. */
  tables: string[]
  /**
   * A `do` block that refuses, before the statements, when the rows already there break what the step assumes: it names
   * the rows and says to fix them in a migration of the project's own written before this one.
   */
  check?: (names: MigrationNames) => RawBuilder<unknown>
  statements: Statements
  /** Its statements on the tables of other modules, by module: they run only while that module is on, once its tables are there. */
  adds?: Partial<Record<ModuleId, Statements>>
}

/**
 * The `ddl` parts of the store's names. `externalUser`: the user table is a relation Protobase did not make, which its
 * statements leave alone, as under `users.keyTable` or as a project's snapshot records it.
 */
export const migrationNames = ({ names, users, uuidIds }: StoreNames, externalUser = users.keyTable !== undefined): MigrationNames => ({
  table: names.table,
  user: users.keyTable ? tableId(users.keyTable.schema, users.keyTable.table) : names.table('user'),
  userDdl: (statements) => (externalUser ? [] : statements),
  metadata: users.metadata,
  id: sql.raw(uuidIds ? 'uuid default pg_catalog.gen_random_uuid()' : 'text'),
  idRef: sql.raw(uuidIds ? 'uuid' : 'text'),
})
