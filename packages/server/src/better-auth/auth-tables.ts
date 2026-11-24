import type { AdminAuth } from './create-auth'
import { builtInModules } from './names/modules'
import { tableNameOf } from './names/resolve-names'
import { storeNames } from './store/store-names'

/** A table as config names it: the search path decides when it names no schema. */
export type TableName = { schema?: string; name: string }

/** The tables the assistant's queries and the app's resources must never read: these, and every table in `schemas`. */
export type AuthStoreTables = { tables: TableName[]; schemas: string[] }

/**
 * The admin store's tables, which the assistant's queries and the app's resources must never read: every table of
 * every module under the store's names, those of a module that is off included, which may keep its rows, each named on
 * its own so a module that is off never clashes with one that is on; with `users.keyTable` the table under the user
 * view too, such as Supabase's `auth.users`, whose password hashes the view leaves out but the table holds; and every
 * table of `users.guardedSchemas`.
 */
export const authStoreTables = (auth: AdminAuth): AuthStoreTables => {
  const { schema, names, users } = storeNames(auth)
  const named = new Set(builtInModules.flatMap((module) => Object.keys(module.tables)).map((table) => tableNameOf(names.input.tables ?? {}, table)))
  const own = [...named].map((name) => ({ schema, name }))
  const tables = users.keyTable ? [...own, { schema: users.keyTable.schema, name: users.keyTable.table }] : own
  return { tables, schemas: users.guardedSchemas }
}
