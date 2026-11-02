import { migrationsTableName, storeTableNames } from '@protobase/server/auth-store'
import { definitionsSchema, userTablesSchema } from '@protobase/server/config-exports'
import { tableKey } from '../db/model'
import type { DbTable } from '../db/model'
import type { Target } from './targets'

// Protobase's own tables, which hold password hashes, OAuth tokens and signing keys, and are no admin pages.
export type ProtobaseSchema = { schema: string; what: 'auth store' | 'job queue' | 'record of migrations' | 'table definitions' | 'user tables'; tables: DbTable[] }

// Better Auth's core tables, which a store an earlier Protobase made without a record of migrations has too, with its
// sessions pointing at its user table.
const storeCore = ['session', 'account', 'verification']

const bySchema = (tables: DbTable[]) => {
  const groups = new Map<string, DbTable[]>()
  for (const table of tables) groups.set(table.schema, [...(groups.get(table.schema) ?? []), table])
  return groups
}

// The store's user table, which the app may name: the one its sessions belong to, in the store's schema.
const userTableOf = (schema: string, tables: DbTable[]) =>
  tables.find((table) => table.name === 'session')?.foreignKeys.find((key) => key.columns.length === 1 && key.columns[0] === 'user_id' && key.refSchema === schema)?.refTable

// The admin store lives in `auth` in the presets and docs, otherwise in a schema with its record of migrations or
// Better Auth's core tables. In `public`, which the app's own tables can share, its tables are those its migrations
// make (`storeTableNames`) and its user table.
const authStore = (schema: string, tables: DbTable[]) => {
  if (schema === 'auth') return tables
  const has = (name: string) => tables.some((table) => table.name === name)
  const user = userTableOf(schema, tables)
  if (!has(migrationsTableName) && !(storeCore.every(has) && user !== undefined)) return []
  if (schema !== 'public') return tables
  return tables.filter((table) => storeTableNames.includes(table.name) || table.name === user)
}

// pg-boss's tables in the jobs schema; a `jobs` schema without them is the app's own.
const jobQueue = (schema: string, tables: DbTable[]) =>
  schema === 'jobs' && ['job', 'version'].every((name) => tables.some((table) => table.name === name)) ? tables : []

// The table `protobase migrate` and the presets' db/migrate.ts record their applied migrations in.
const migrationRecord = (schema: string, tables: DbTable[]) =>
  schema === 'migrations' && tables.some((table) => table.name === 'applied') ? tables : []

// The definitions of the tables users add.
const tableDefinitions = (schema: string, tables: DbTable[]) =>
  schema === definitionsSchema && ['tables', 'fields'].every((name) => tables.some((table) => table.name === name)) ? tables : []

// The tables users add that no resource in code claims: the server serves them from their definitions.
const userTables = (schema: string, tables: DbTable[], claimed: ReadonlySet<string>) =>
  schema === userTablesSchema ? tables.filter((table) => !claimed.has(tableKey(table))) : []

// The schemas of Protobase's own tables. The auth store, which holds password hashes, sessions and tokens, and the
// tables users add that no resource in code claims (`claimed`, as schema.table) are left out whatever the target names;
// the job queue, the record of migrations and the table definitions are scaffolded when the target names their schema.
export const protobaseSchemas = (tables: DbTable[], target: Target, claimed: ReadonlySet<string> = new Set()): ProtobaseSchema[] =>
  [...bySchema(tables)].flatMap(([schema, own]): ProtobaseSchema[] => {
    const store = authStore(schema, own)
    if (store.length > 0) return [{ schema, what: 'auth store', tables: store }]
    const added = userTables(schema, own, claimed)
    if (added.length > 0) return [{ schema, what: 'user tables', tables: added }]
    if (target.schema === schema) return []
    const definitions = tableDefinitions(schema, own)
    if (definitions.length > 0) return [{ schema, what: 'table definitions', tables: definitions }]
    const queue = jobQueue(schema, own)
    if (queue.length > 0) return [{ schema, what: 'job queue', tables: queue }]
    const record = migrationRecord(schema, own)
    return record.length > 0 ? [{ schema, what: 'record of migrations', tables: record }] : []
  })
