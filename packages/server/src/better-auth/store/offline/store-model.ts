import { builtInModules, type ModuleId } from '../../names/modules'
import { allModules } from '../../names/modules-on'
import { resolveNames } from '../../names/resolve-names'
import type { ModuleDeclaration } from '../../names/declaration'
import { moduleSteps } from '../steps'
import type { StoreNames } from '../store-names'

// The auth store as the runtime reads it, as plain data a project's snapshot keeps: every name the store's names
// resolve, and each module's last step applied. Comparing two of them says what a migration changes.

/** A table: its name, whether its rows belong to an organization, and its columns and indexes by internal name. */
export type ModelTable = { name: string; scope: 'global' | 'organization'; columns: Record<string, string>; indexes: Record<string, string> }

export type StoreModel = {
  /** The store's schema; `null` when the search path decides. */
  schema: string | null
  /** The type of every id column. */
  ids: 'uuid' | 'text'
  /** The table every foreign key to the users points at when the user table is a view (`users.keyTable`). */
  userKeyTable: string | null
  /** The user table's JSON metadata column (`users.metadata`). */
  userMetadata: string | null
  /** Whether every table whose rows belong to an organization has the column that names it. */
  scopedTablesCarryOrganization: boolean
  /** Each module that is on: its last step applied and its tables by internal name. */
  modules: Partial<Record<ModuleId, { lastStep: number; tables: Record<string, ModelTable> }>>
}

/** Each module's last step applied, by module. */
export type LastSteps = Partial<Record<ModuleId, number>>

/** The last step of each module of `modules`, as this version of Protobase ships them. */
export const latestSteps = (modules: readonly ModuleId[]): LastSteps => Object.fromEntries(modules.map((module) => [module, moduleSteps[module].at(-1)!.step]))

const declaredIndexes = (internal: string) => (builtInModules as readonly ModuleDeclaration[]).flatMap((module) => module.tables[internal]?.indexes ?? [])

/** The model of a store with `names` at `lastSteps`: a module `lastSteps` leaves out is not in it. */
export const storeModel = ({ schema, names, users, uuidIds }: StoreNames, lastSteps: LastSteps): StoreModel => {
  const tables = Object.values(names.tables)
  const modules = names.modules.filter((module) => lastSteps[module] !== undefined)
  return {
    schema: schema ?? null,
    ids: uuidIds ? 'uuid' : 'text',
    userKeyTable: users.keyTable ? `${users.keyTable.schema}.${users.keyTable.table}` : null,
    userMetadata: users.metadata ?? null,
    scopedTablesCarryOrganization: tables.filter((table) => table.scope === 'organization').every((table) => 'organization_id' in table.columns),
    modules: Object.fromEntries(
      modules.map((module) => [
        module,
        {
          lastStep: lastSteps[module]!,
          tables: Object.fromEntries(
            tables
              .filter((table) => table.module === module)
              .map((table) => [
                table.internal,
                {
                  name: table.name,
                  scope: table.scope,
                  columns: Object.fromEntries(Object.values(table.columns).map((column) => [column.internal, column.name])),
                  indexes: Object.fromEntries(declaredIndexes(table.internal).map((index) => [index, table.index(index).name])),
                },
              ]),
          ),
        },
      ]),
    ),
  }
}

/** Every name the store has in the database: its schema, each table, `table.column` and index, sorted. */
export const storeNamesList = (model: StoreModel) => {
  const prefix = model.schema === null ? '' : `${model.schema}.`
  const tables = Object.values(model.modules).flatMap((module) => Object.values(module!.tables))
  return [
    ...(model.schema === null ? [] : [model.schema]),
    ...tables.flatMap((table) => [`${prefix}${table.name}`, `${prefix}${table.name}.id`, ...Object.values(table.columns).map((column) => `${prefix}${table.name}.${column}`), ...Object.values(table.indexes).map((index) => `${prefix}${index}`)]),
  ].sort()
}

/** A module turned off whose tables and rows the store keeps: the last step it had, and its tables' names then. */
export type KeptModule = { module: ModuleId; step: number; tables: Record<string, ModelTable> }

/** `module` kept at `step`, its tables named as `names` would name them with it on. */
export const keptModule = ({ schema, names, users, uuidIds }: StoreNames, module: ModuleId, step: number): KeptModule => {
  const withIt = resolveNames({ ...names.input, modules: allModules.filter((other) => other === module || names.modules.includes(other)) })
  return { module, step, tables: storeModel({ schema, names: withIt, users, uuidIds }, { [module]: step }).modules[module]!.tables }
}
