import { getSchema } from 'better-auth/db'
import { getMigrations } from 'better-auth/db/migration'
import { sql } from 'kysely'
import type { AdminAuth } from '../create-auth'
import { plainStoreDb } from './store-db'
import { storeNames } from './store-names'

// Better Auth compares tables alone, so a user table that is a view (`users.keyTable`) is one it always finds missing:
// the view's columns are compared here instead, as the catalogue lists them for views and tables alike.

/** Each column of Better Auth's user model the view lacks, or the view itself when there is none. */
const userViewDrift = async (auth: AdminAuth) => {
  const { schema, names } = storeNames(auth)
  const user = names.table('user').name
  const { rows } = await sql<{ column: string }>`select column_name as "column" from information_schema.columns
    where table_schema = ${schema ?? sql`current_schema()`} and table_name = ${user}`.execute(plainStoreDb(auth))
  if (rows.length === 0) return [`lacks the view ${user}`]
  const found = new Set(rows.map(({ column }) => column))
  const wanted = ['id', ...Object.keys(getSchema(auth.options)[user]?.fields ?? {})]
  return wanted.filter((column) => !found.has(column)).map((column) => `lacks the column ${user}.${column}`)
}

/**
 * What Better Auth, with the features the app turns on, finds the store lacks or has otherwise: tables, `table.column`s,
 * indexes and its other findings; none when the store matches. It compares the database's tables, so only
 * `protobase dev` runs it, on the developer's machine: a deploy reads the record of migrations instead (`checkMigrationRecord`).
 * Better Auth compares through the store's plain connections, without the app's query plugins.
 */
export const authSchemaDrift = async (auth: AdminAuth) => {
  const { database } = auth.options
  const options = database && 'db' in database ? { ...auth.options, database: { ...database, db: plainStoreDb(auth) } } : auth.options
  const { toBeCreated, toBeAdded, toBeAddedIndexes, schemaProblems } = await getMigrations(options, { throwOnUnsafe: false })
  const view = auth.users.keyTable ? auth.names.table('user').name : undefined
  const tables = [
    ...toBeCreated.filter(({ table }) => table !== view).map(({ table }) => `lacks the table ${table}`),
    ...toBeAdded.filter(({ table }) => table !== view).flatMap(({ table, fields }) => Object.keys(fields).map((field) => `lacks the column ${table}.${field}`)),
    ...toBeAddedIndexes.filter(({ table }) => table !== view).map(({ name }) => `lacks the index ${name}`),
    ...schemaProblems,
  ]
  return view ? [...tables, ...(await userViewDrift(auth))] : tables
}
