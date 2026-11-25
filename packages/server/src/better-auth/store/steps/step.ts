import { sql, type RawBuilder } from 'kysely'
import { tableId, type TableId } from '../../names/identifiers'
import type { ModuleId } from '../../names/modules'
import type { DefaultOrganization } from '../../organizations/options'
import { allModules } from '../../names/modules-on'
import { resolveNames, tableNameOf, type ResolvedNames } from '../../names/resolve-names'
import type { StoreNames } from '../store-names'

/** The names a step's statements use, as `ddl` parts. */
export type MigrationNames = {
  /** A table of a module that is on, by internal name, in its schema, with its columns and indexes as the store's names resolve them. */
  table: ResolvedNames['table']
  /** What every foreign key to the users points at: the user table, in the store's schema, or `users.keyTable`. */
  user: TableId
  /** The user table's own statements, which make it or add its columns: none when it is a view (`users.keyTable`). */
  userDdl: (statements: RawBuilder<unknown>[]) => RawBuilder<unknown>[]
  /** Whether the user table is a relation Protobase did not make, whose users may be there before the store. */
  externalUser: boolean
  /** The user table's JSON metadata column (`users.metadata`), when there is one. */
  metadata: string | undefined
  /** An id column's type and default, before `primary key`. */
  id: RawBuilder<unknown>
  /** The type of a column that holds another table's id. */
  idRef: RawBuilder<unknown>
  /**
   * A table Protobase no longer declares, by internal name, as the store's names named it: in the store's schema, after
   * the prefix. Refuses when a table the config names, of any module, or the user key table has that name (`formerTable`).
   */
  former: (internal: string) => TableId
}

/** The organizations' settings a step writes rows from: the default organization, and the app role of the users there already. */
export type OrganizationsInput = { default: DefaultOrganization; existingUsersRole: string | undefined }

/** The organizations' input of the steps from their settings; `undefined` without a default organization. */
export const organizationsInput = (settings: { default?: DefaultOrganization; existingUsersRole?: string } | undefined): OrganizationsInput | undefined =>
  settings?.default ? { default: settings.default, existingUsersRole: settings.existingUsersRole } : undefined

/**
 * What a step writes that the config decides rather than the store's names, kept apart from them: `organizations`,
 * undefined when the config has no default organization; `firstOn`, whether the migration makes the organizations'
 * tables, as when they turn on for the first time, rather than finding them there; `usersThere`, whether the user
 * table may hold users already: the store had it, or another system made it.
 */
export type StepInput = { organizations: OrganizationsInput | undefined; firstOn: boolean; usersThere: boolean }

type Statements = (names: MigrationNames, input: StepInput) => RawBuilder<unknown>[]

type Check = (names: MigrationNames, input: StepInput) => RawBuilder<unknown>

/**
 * Statements that run once the migration's transaction commits: with `concurrent`, outside any transaction, from the
 * migration's `.after.sql`, so a fill may commit batch by batch and an index build concurrently; without it, as when the
 * store is written as one transaction, inside it, as one update and a plain index.
 */
type After = (names: MigrationNames, input: StepInput, concurrent: boolean) => RawBuilder<unknown>[]

/**
 * One step of a module's chain, numbered from 1 within its module. Once released its statements never change, only the
 * names they are written with: a later change to the module's tables is a step of its own, with the next number. Each
 * table it makes is named in `tables`; the user table may be one another system made, such as Supabase's `auth.users`,
 * so it is made only when missing and every column is added only when missing, or a view the app makes itself over
 * another system's, which the statements leave alone.
 *
 * A step only adds: a table, a nullable column, an index, or a column whose default or fill comes from data already
 * there (`step-lint.ts`), or drops a table Protobase no longer declares (`drops`). One that assumes something of the rows already there, such as a unique index over them, holds
 * a `check` that refuses before anything changes.
 */
export type Step = {
  step: number
  name: string
  /** What it makes, the comment above its statements. */
  title: string
  /**
   * The version of the store's former single chain this step came from, which adopting a store without any record
   * maps onto its steps: a new step takes the next version after the latest (`legacy-versions.ts`).
   */
  version: number
  /** The tables it makes, besides the user table, by internal name. */
  tables: string[]
  /** The tables it drops, by internal name, which Protobase no longer declares: a reviewed exception to the step lint. */
  drops?: string[]
  /**
   * A `do` block that refuses, before the statements, when the rows already there break what the step assumes: it names
   * the rows and says to fix them in a migration of the project's own written before this one.
   */
  check?: Check
  statements: Statements
  /** Its statements on the tables of other modules, by module: they run only while that module is on, once its tables are there. */
  adds?: Partial<Record<ModuleId, Statements>>
  /** The checks of those statements, by module, which refuse as `check` does before them; none where the input needs none. */
  addsChecks?: Partial<Record<ModuleId, (names: MigrationNames, input: StepInput) => RawBuilder<unknown> | undefined>>
  /** What those statements leave to run once the migration's transaction commits, by module (`After`). */
  addsAfter?: Partial<Record<ModuleId, After>>
}

/**
 * A table Protobase no longer declares, as `former` names it. Refuses when a table the config names, of a module on or
 * off, or the user key table in the store's schema has that name, so a step that drops it never drops a table in use.
 */
export const formerTable = ({ schema, names, users }: Pick<StoreNames, 'schema' | 'names' | 'users'>, internal: string) => {
  const id = tableId(schema, tableNameOf(names.input.tables ?? {}, internal))
  const every = resolveNames({ ...names.input, modules: allModules })
  const taken = Object.values(every.tables).find((table) => table.name === id.name)
  const keyTable = users.keyTable && users.keyTable.schema === schema && users.keyTable.table === id.name
  if (taken || keyTable) {
    const which = taken ? `${taken.internal} table` : 'users.keyTable table'
    throw new Error(`The auth store's ${which} is named ${id.name}, the name of the former ${internal} table that a step drops: give it another name in the config`)
  }
  return id
}

/**
 * The `ddl` parts of the store's names. `externalUser`: the user table is a relation Protobase did not make, which its
 * statements leave alone, as under `users.keyTable` or as a project's snapshot records it.
 */
export const migrationNames = ({ schema, names, users, uuidIds }: StoreNames, externalUser = users.keyTable !== undefined): MigrationNames => ({
  table: names.table,
  user: users.keyTable ? tableId(users.keyTable.schema, users.keyTable.table) : names.table('user'),
  userDdl: (statements) => (externalUser ? [] : statements),
  externalUser,
  metadata: users.metadata,
  id: sql.raw(uuidIds ? 'uuid default pg_catalog.gen_random_uuid()' : 'text'),
  idRef: sql.raw(uuidIds ? 'uuid' : 'text'),
  former: (internal) => formerTable({ schema, names, users }, internal),
})
