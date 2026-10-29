import type { AdminAuth } from './create-auth'
import { storeNames } from './store/store-names'
import { storeTableNames } from './store/table-names'

/** A table as config names it: the search path decides when it names no schema. */
export type TableName = { schema?: string; name: string }

/** The tables the assistant's queries and the app's resources must never read: these, and every table in `schemas`. */
export type AuthStoreTables = { tables: TableName[]; schemas: string[] }

/**
 * The admin store's tables, which the assistant's queries and the app's resources must never read: the user table and
 * `storeTableNames`, with `users.keyTable` the table under the user view too, such as Supabase's `auth.users`, whose
 * password hashes the view leaves out but the table holds, and every table of `users.guardedSchemas`.
 */
export const authStoreTables = (auth: AdminAuth): AuthStoreTables => {
  const { schema, users } = storeNames(auth)
  const own = [users.modelName, ...storeTableNames].map((name) => ({ schema, name }))
  const tables = users.keyTable ? [...own, { schema: users.keyTable.schema, name: users.keyTable.table }] : own
  return { tables, schemas: users.guardedSchemas }
}
