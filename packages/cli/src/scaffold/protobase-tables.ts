import { migrationsTableName, storeTableNames } from '@protobase/server/auth-store'
import type { DbTable } from '../db/model'
import type { Target } from './targets'

// Protobase's own tables, which hold password hashes, OAuth tokens and signing keys, and are no admin pages.
export type ProtobaseSchema = { schema: string; what: 'auth store' | 'job queue'; tables: DbTable[] }

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

// The schemas of Protobase's own tables. The auth store, which holds password hashes, sessions and tokens, is left out
// whatever the target names; the job queue is scaffolded when the target names its schema.
export const protobaseSchemas = (tables: DbTable[], target: Target): ProtobaseSchema[] =>
  [...bySchema(tables)].flatMap(([schema, own]): ProtobaseSchema[] => {
    const store = authStore(schema, own)
    if (store.length > 0) return [{ schema, what: 'auth store', tables: store }]
    if (target.schema === schema) return []
    const queue = jobQueue(schema, own)
    return queue.length > 0 ? [{ schema, what: 'job queue', tables: queue }] : []
  })
