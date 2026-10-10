import { getMigrations } from 'better-auth/db/migration'
import type { AdminAuth } from './create-auth'
import { snakeCaseMigration } from './snake-case-migration'

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

type Plan = Awaited<ReturnType<typeof getMigrations>>

/**
 * Better Auth adds `email_verified` to a `user` table that exists only when the table still has the camelCase names
 * of Protobase 0.6, whose `emailVerified` it does not know: such a store is renamed, never given new columns beside
 * the old ones.
 */
const hasCamelCaseNames = ({ toBeAdded }: Plan) => toBeAdded.some(({ table, fields }) => table === 'user' && 'email_verified' in fields)

const storeSchema = ({ options: { database } }: AdminAuth) => (database && 'schemaName' in database ? database.schemaName : undefined)

/**
 * The SQL that brings the admin store up to what this version of Protobase and the project's Better Auth plugins need:
 * for a store with the camelCase names of Protobase 0.6, their rename to snake_case (`snakeCaseMigration`); otherwise
 * new tables, columns and indexes, never a drop, each skipped where it exists. `undefined` when the store is current. A
 * change Better Auth cannot make safely, such as a required column without a default on a table with rows, is an error.
 */
export const authSchemaMigration = async (auth: AdminAuth) => {
  if (hasCamelCaseNames(await getMigrations(auth.options, { throwOnUnsafe: false }))) return snakeCaseMigration(storeSchema(auth))
  const { toBeCreated, toBeAdded, toBeAddedIndexes, compileMigrations } = await getMigrations(auth.options)
  if (toBeCreated.length === 0 && toBeAdded.length === 0 && toBeAddedIndexes.length === 0) return undefined
  return skipExisting(await compileMigrations())
}

/** The tables and `table.column`s the admin store lacks; an index missing is not a reason to refuse requests. */
const missingTablesAndColumns = ({ toBeCreated, toBeAdded }: Plan) => [
  ...toBeCreated.map(({ table }) => table),
  ...toBeAdded.flatMap(({ table, fields }) => Object.keys(fields).map((field) => `${table}.${field}`)),
]

/**
 * Refuses to go on while the admin store lacks a table or column Better Auth needs, or still has the camelCase names
 * of Protobase 0.6, since every sign-in would fail. The server never changes the schema itself: the project's
 * migrations do, before the new version serves.
 */
export const checkAuthSchema = async (auth: AdminAuth) => {
  const plan = await getMigrations(auth.options, { throwOnUnsafe: false })
  if (hasCamelCaseNames(plan)) {
    throw new Error(
      `The auth schema still has the camelCase names of Protobase 0.6, which this version names in snake_case. Write their rename as a migration with \`${authMigrationCommand}\`, apply it with the project's migrations, then start again.`,
    )
  }
  const missing = missingTablesAndColumns(plan)
  if (missing.length === 0) return
  throw new Error(
    `The auth schema is behind this version of Protobase (missing ${missing.join(', ')}). Write the change as a migration with \`${authMigrationCommand}\`, apply it with the project's migrations, then start again.`,
  )
}
