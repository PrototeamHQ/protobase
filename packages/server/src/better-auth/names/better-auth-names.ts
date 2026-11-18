import type { DBFieldAttribute } from '@better-auth/core/db'
import type { BuiltInTables, FieldOf, ModuleId, OwnAttribute, OwnField, TableOfModel } from './modules'
import type { ResolvedNames, ResolvedTable } from './resolve-names'

// The one place the resolved names reach Better Auth: its core tables' `modelName` and `fields`, the `schema` option
// of each of its plugins, and the tables and fields Protobase's own plugins and options define.

const tableOf = (names: ResolvedNames, model: string) => {
  const table = names.model(model)
  if (!table) throw new Error(`No table of the auth store holds Better Auth's ${model}: its module is off`)
  return table
}

/** A core table's option, or a plugin's `schema` option for one model: its table's name, and each field's column. */
const option = (table: ResolvedTable) => ({ modelName: table.name, fields: Object.fromEntries(Object.values(table.fields).map(({ field, name }) => [field, name])) })

// The fields Protobase defines on `table`, named; `picked` limits them.
const attributes = (table: ResolvedTable, picked?: readonly string[]) => {
  const unknown = picked?.find((field) => !table.fields[field]?.attribute)
  if (unknown !== undefined) throw new Error(`${table.internal} declares no field ${unknown} of Protobase's own`)
  const own = Object.values(table.fields).filter(({ field, attribute }) => attribute && (!picked || picked.includes(field)))
  return Object.fromEntries(own.map(({ field, name, attribute }) => [field, { ...attribute, fieldName: name } as DBFieldAttribute]))
}

export type BetterAuthNames = ReturnType<typeof betterAuthNames>

/** Better Auth's names from the resolved model. */
export const betterAuthNames = (names: ResolvedNames) => ({
  /** The `user`, `session`, `account` and `verification` options' `modelName` and `fields`. */
  user: option(tableOf(names, 'user')),
  session: option(tableOf(names, 'session')),
  account: option(tableOf(names, 'account')),
  verification: option(tableOf(names, 'verification')),
  /** The `schema` option of a plugin of Better Auth's, for the models it has, each with the fields its table declares. */
  schema: <Model extends string>(...models: Model[]) =>
    Object.fromEntries(models.map((model) => [model, option(tableOf(names, model))])) as { [M in Model]: { modelName: string; fields: { [F in FieldOf<TableOfModel<M>>]: string } } },
  /** The `schema` option of a plugin of Better Auth's that holds every table of a module, such as the OAuth provider's of `mcp`. */
  moduleSchema: (module: ModuleId) =>
    Object.fromEntries(Object.values(names.tables).filter((table) => table.module === module && table.model).map((table) => [table.model!, option(table)])),
  /** The fields Protobase defines on a table, by internal name, such as `additionalFields` or a plugin's field on the user. */
  fields: <Table extends keyof BuiltInTables, Field extends OwnField<Table>>(table: Table, picked: readonly Field[]) =>
    // The declarations' types say which attribute each field has.
    attributes(names.table(table), picked) as unknown as { [F in Field]: OwnAttribute<Table, F> & { fieldName: string } },
  /** The `schema` of a plugin of Protobase's own: each of its models' tables, with every field. */
  tables: <Model extends string>(...models: Model[]) =>
    Object.fromEntries(models.map((model) => [model, { modelName: tableOf(names, model).name, fields: attributes(tableOf(names, model)) }])) as Record<Model, { modelName: string; fields: Record<string, DBFieldAttribute> }>,
})
