import { getMigrations } from 'better-auth/db/migration'
import type { AdminAuth } from '../create-auth'

/**
 * What Better Auth, with the features the app turns on, finds the store lacks or has otherwise: tables, `table.column`s,
 * indexes and its other findings; none when the store matches. It compares the database's tables, so only
 * `protobase dev` runs it, on the developer's machine: a deploy reads the record of migrations instead (`checkAuthSchema`).
 */
export const authSchemaDrift = async (auth: AdminAuth) => {
  const { toBeCreated, toBeAdded, toBeAddedIndexes, schemaProblems } = await getMigrations(auth.options, { throwOnUnsafe: false })
  return [
    ...toBeCreated.map(({ table }) => `lacks the table ${table}`),
    ...toBeAdded.flatMap(({ table, fields }) => Object.keys(fields).map((field) => `lacks the column ${table}.${field}`)),
    ...toBeAddedIndexes.map(({ name }) => `lacks the index ${name}`),
    ...schemaProblems,
  ]
}
