import { getSchema } from 'better-auth/db'
import { getMigrations } from 'better-auth/db/migration'
import { sql } from 'kysely'
import type { AdminAuth } from '../create-auth'
import { storeDb } from './store-db'
import { storeNames } from './store-names'

// Better Auth compares tables alone, so a user table that is a view (`users.keyTable`) is one it always finds missing:
// the view's columns are compared here instead, as the catalogue lists them for views and tables alike.

/** Each column of Better Auth's user model the view lacks, or the view itself when there is none. */
const userViewDrift = async (auth: AdminAuth) => {
  const { schema, users } = storeNames(auth)
  const { rows } = await sql<{ column: string }>`select column_name as "column" from information_schema.columns
    where table_schema = ${schema ?? sql`current_schema()`} and table_name = ${users.modelName}`.execute(storeDb(auth))
  if (rows.length === 0) return [`lacks the view ${users.modelName}`]
  const found = new Set(rows.map(({ column }) => column))
  const wanted = ['id', ...Object.keys(getSchema(auth.options)[users.modelName]?.fields ?? {})]
  return wanted.filter((column) => !found.has(column)).map((column) => `lacks the column ${users.modelName}.${column}`)
}

/**
 * What Better Auth, with the features the app turns on, finds the store lacks or has otherwise: tables, `table.column`s,
 * indexes and its other findings; none when the store matches. It compares the database's tables, so only
 * `protobase dev` runs it, on the developer's machine: a deploy reads the record of migrations instead (`checkAuthSchema`).
 */
export const authSchemaDrift = async (auth: AdminAuth) => {
  const { toBeCreated, toBeAdded, toBeAddedIndexes, schemaProblems } = await getMigrations(auth.options, { throwOnUnsafe: false })
  const view = auth.userTable.keyTable ? auth.userTable.modelName : undefined
  const tables = [
    ...toBeCreated.filter(({ table }) => table !== view).map(({ table }) => `lacks the table ${table}`),
    ...toBeAdded.filter(({ table }) => table !== view).flatMap(({ table, fields }) => Object.keys(fields).map((field) => `lacks the column ${table}.${field}`)),
    ...toBeAddedIndexes.filter(({ table }) => table !== view).map(({ name }) => `lacks the index ${name}`),
    ...schemaProblems,
  ]
  return view ? [...tables, ...(await userViewDrift(auth))] : tables
}
