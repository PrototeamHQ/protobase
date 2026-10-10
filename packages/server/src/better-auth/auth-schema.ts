import { getMigrations } from 'better-auth/db/migration'
import type { AdminAuth } from './create-auth'

// Both read the store's tables through Better Auth's own migration planner, which only introspects: neither writes.

/** The command that writes the pending changes as a migration file of the project. */
export const authMigrationCommand = 'protobase auth migration'

/**
 * Better Auth's statements, each made to skip what exists already, so a migration written from an empty database also
 * applies to one an earlier Protobase set up in place.
 */
export const skipExisting = (sql: string) =>
  sql
    .split(';\n\n')
    .map((statement) =>
      statement
        .replace(/^create table (?!if not exists )/, 'create table if not exists ')
        .replace(/^create (unique )?index (?!if not exists )/, (_, unique: string | undefined) => `create ${unique ?? ''}index if not exists `)
        .replace(/^(alter table .+? )add column (?!if not exists )/, '$1add column if not exists '),
    )
    .join(';\n\n')

/**
 * The SQL that brings the admin store up to what this version of Protobase and the project's Better Auth plugins need:
 * new tables, columns and indexes, never a drop, each skipped where it exists. `undefined` when the store is current. A
 * change Better Auth cannot make safely, such as a required column without a default on a table with rows, is an error.
 */
export const authSchemaMigration = async (auth: AdminAuth) => {
  const { toBeCreated, toBeAdded, toBeAddedIndexes, compileMigrations } = await getMigrations(auth.options)
  if (toBeCreated.length === 0 && toBeAdded.length === 0 && toBeAddedIndexes.length === 0) return undefined
  return skipExisting(await compileMigrations())
}

/** The tables and `table.column`s the admin store lacks; an index missing is not a reason to refuse requests. */
export const missingAuthSchema = async (auth: AdminAuth) => {
  const { toBeCreated, toBeAdded } = await getMigrations(auth.options, { throwOnUnsafe: false })
  return [...toBeCreated.map(({ table }) => table), ...toBeAdded.flatMap(({ table, fields }) => Object.keys(fields).map((field) => `${table}.${field}`))]
}

/**
 * Refuses to go on while the admin store lacks a table or column Better Auth needs, since every sign-in would fail.
 * The server never changes the schema itself: the project's migrations do, before the new version serves.
 */
export const checkAuthSchema = async (auth: AdminAuth) => {
  const missing = await missingAuthSchema(auth)
  if (missing.length === 0) return
  throw new Error(
    `The auth schema is behind this version of Protobase (missing ${missing.join(', ')}). Write the change as a migration with \`${authMigrationCommand}\`, apply it with the project's migrations, then start again.`,
  )
}
