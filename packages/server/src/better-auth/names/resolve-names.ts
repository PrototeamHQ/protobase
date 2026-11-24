import type { DBFieldAttribute } from '@better-auth/core/db'
import { indexScopes, type ColumnDeclaration, type IndexScope, type ModuleDeclaration, type TableDeclaration } from './declaration'
import { checkConfiguredName, generatedName } from './identifier-length'
import { columnId, indexId, tableId, type ColumnId, type IndexId, type TableId } from './identifiers'
import { builtInModules, type BuiltInTables, type ModuleId } from './modules'
import { allModules, checkRequiredModules } from './modules-on'

/** A column as the model resolves it, with the Better Auth field it holds and that field's attribute where Protobase defines it. */
export type ResolvedColumn = ColumnId & { internal: string; field: string; attribute?: Omit<DBFieldAttribute, 'fieldName'> }

/** A table as the model resolves it: its name in its schema, its columns by internal name and by Better Auth field, and its indexes. */
export type ResolvedTable<Column extends string = string> = TableId & {
  internal: string
  module: ModuleId
  model: string | undefined
  scope: TableDeclaration['scope']
  columns: Record<Column, ResolvedColumn>
  /** The columns by the Better Auth field each holds. */
  fields: Record<string, ResolvedColumn>
  /** Its declared indexes, by internal name, with what each serves (`IndexScope`), those of the modules that are on included. */
  indexes: Record<string, IndexScope>
  /** A declared index of the table, by internal name. */
  index: (internal: string) => IndexId
}

/**
 * `tables`: the names the store's tables and columns get in the database, where the app wants others than the
 * built-in ones: a `prefix` before every table's name, and per table, by its built-in name, its own `name` and its
 * `columns`, each by its built-in name. A table the config names takes that name without the prefix; one it leaves out
 * keeps its built-in name, after the prefix. `id` keeps its name.
 *
 * ```ts
 * tables: { prefix: 'app_', user: { name: 'users', columns: { role: 'app_role' } } }
 * ```
 */
export type TableNames = { prefix?: string } & { [Table in keyof BuiltInTables]?: { name?: string; columns?: Partial<Record<BuiltInTables[Table], string>> } }

export type NamesInput = {
  /** The store's schema; the search path decides when undefined. */
  schema: string | undefined
  tables?: TableNames
  /** The modules that are on; every one by default. */
  modules?: readonly ModuleId[]
}

export type ResolvedNames = {
  schema: string | undefined
  modules: readonly ModuleId[]
  /** Every table of the modules that are on, by internal name. */
  tables: Record<string, ResolvedTable>
  /** A built-in table, by internal name. */
  table: <Table extends keyof BuiltInTables>(internal: Table) => ResolvedTable<BuiltInTables[Table]>
  /** The table that holds Better Auth's model, such as `twoFactor`; undefined when no table of a module that is on holds it. */
  model: (model: string) => ResolvedTable | undefined
  /** What the names were resolved from, to resolve them again in another schema. */
  input: NamesInput
}

type Declared = { module: ModuleDeclaration; internal: string; table: TableDeclaration; columns: Record<string, ColumnDeclaration>; indexes: Record<string, IndexScope> }

// Each table of the modules that are on, with the columns and indexes its own module declares and those the others that are on add.
const declaredTables = (on: readonly ModuleId[]): Declared[] => {
  const modules: readonly ModuleDeclaration[] = builtInModules.filter(({ id }) => on.includes(id))
  return modules.flatMap((module) =>
    Object.entries(module.tables).map(([internal, table]) => ({
      module,
      internal,
      table,
      columns: Object.assign({}, table.columns, ...modules.map((other) => other.columns?.[internal] ?? {})) as Record<string, ColumnDeclaration>,
      indexes: Object.assign({}, indexScopes(table), ...modules.map((other) => other.indexes?.[internal] ?? {})) as Record<string, IndexScope>,
    })),
  )
}

type TableConfig = { name?: string; columns?: Record<string, string | undefined> }

const checkConfig = (tables: TableNames, declared: Declared[]) => {
  const { prefix, ...named } = tables
  if (prefix !== undefined) checkConfiguredName(prefix, 'auth.tables.prefix')
  for (const [internal, config] of Object.entries(named) as [string, TableConfig | undefined][]) {
    const table = declared.find((candidate) => candidate.internal === internal)
    if (!table) throw new Error(`auth.tables names "${internal}", which is not a table of the auth store: ${declared.map((known) => known.internal).join(', ')}`)
    if (config?.name !== undefined) checkConfiguredName(config.name, `auth.tables.${internal}.name`)
    for (const [column, name] of Object.entries(config?.columns ?? {})) {
      if (column === 'id') throw new Error(`auth.tables.${internal}.columns names id, which keeps its name`)
      if (!(column in table.columns)) throw new Error(`auth.tables.${internal}.columns names "${column}", which is not a column of ${internal}: ${Object.keys(table.columns).join(', ')}`)
      if (name !== undefined) checkConfiguredName(name, `auth.tables.${internal}.columns.${column}`)
    }
  }
}

const refuseTwice = (names: string[], what: string) => {
  const twice = names.find((name, i) => names.indexOf(name) !== i)
  if (twice !== undefined) throw new Error(`auth.tables gives ${what} the name "${twice}" twice: give each its own`)
}

/** The name `tables` gives a table, by internal name: its own `name`, or its built-in one after the prefix. */
export const tableNameOf = (tables: TableNames, internal: string) => (tables as Record<string, TableConfig | undefined>)[internal]?.name ?? generatedName(`${tables.prefix ?? ''}${internal}`)

const resolveTable = (schema: string | undefined, { module, internal, table, columns, indexes }: Declared, prefix: string, config: TableConfig = {}): ResolvedTable => {
  const id = tableId(schema, config.name ?? generatedName(`${prefix}${internal}`))
  const resolved = Object.fromEntries(
    Object.entries(columns).map(([column, { field, attribute }]) => [column, { ...columnId(id, config.columns?.[column] ?? column), internal: column, field, ...(attribute && { attribute }) }]),
  )
  refuseTwice(['id', ...Object.values(resolved).map(({ name }) => name)], `two columns of ${internal}`)
  return {
    ...id,
    internal,
    module: module.id as ModuleId,
    model: table.model,
    scope: table.scope,
    columns: resolved,
    fields: Object.fromEntries(Object.values(resolved).map((column) => [column.field, column])),
    indexes,
    index: (index) => {
      if (!(index in indexes) || !index.startsWith(`${internal}_`)) throw new Error(`${index} is not an index ${internal} declares`)
      return indexId(id, generatedName(`${id.name}${index.slice(internal.length)}`))
    },
  }
}

/**
 * The store's names: every table of the modules that are on, under the name `tables` gives it or its built-in one, each
 * column likewise. Refuses a module that is on while one it requires is off, a table or column `tables` names that
 * the store has not, a configured name Postgres would cut, and a name two tables, a table and an index, or two columns of one, share.
 */
export const resolveNames = (input: NamesInput): ResolvedNames => {
  const { schema, tables = {}, modules = allModules } = input
  checkRequiredModules(modules)
  const declared = declaredTables(modules)
  // A table of a module that is off may be named, as for its tables the store keeps.
  checkConfig(tables, declaredTables(allModules))
  const configs = tables as Record<string, TableConfig | undefined>
  const each = declared.map((table) => ({ indexes: Object.keys(table.indexes), resolved: resolveTable(schema, table, tables.prefix ?? '', configs[table.internal]) }))
  const resolved = Object.fromEntries(each.map((table) => [table.resolved.internal, table.resolved]))
  // Postgres keeps a schema's tables and indexes under one set of names.
  const relations = each.flatMap(({ indexes, resolved: table }) => [table.name, ...indexes.map((index) => table.index(index).name)])
  refuseTwice(relations, 'two tables, or a table and an index,')
  return {
    schema,
    modules,
    tables: resolved,
    // The declarations' types say which columns each table has.
    table: ((internal: string) => {
      const table = resolved[internal]
      if (!table) throw new Error(`The auth store has no ${internal} table: its module is off`)
      return table
    }) as ResolvedNames['table'],
    model: (model) => Object.values(resolved).find((table) => table.model === model),
    input,
  }
}
