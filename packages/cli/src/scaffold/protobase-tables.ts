import type { DbTable } from '../db/model'
import type { Target } from './targets'

// Protobase's own tables, which hold password hashes, OAuth tokens and signing keys, and are no admin pages.
export type ProtobaseSchema = { schema: string; what: 'auth store' | 'job queue'; tables: DbTable[] }

const storeCore = ['user', 'session', 'account', 'verification']
const storeTables = new Set([...storeCore, 'jwks', 'passkey', 'two_factor', 'sign_in_policy', 'staff_sign_in'])
const isStoreTable = (name: string) => storeTables.has(name) || name.startsWith('oauth_')

const bySchema = (tables: DbTable[]) => {
  const groups = new Map<string, DbTable[]>()
  for (const table of tables) groups.set(table.schema, [...(groups.get(table.schema) ?? []), table])
  return groups
}

// The admin store lives in `auth` in the presets and docs, otherwise in a schema with Better Auth's core tables.
const authStore = (schema: string, tables: DbTable[]) => {
  if (schema === 'auth') return tables
  if (!storeCore.every((name) => tables.some((table) => table.name === name))) return []
  // The app's own tables can share `public` with the store, so only the store's tables are left out there.
  return schema === 'public' ? tables.filter((table) => isStoreTable(table.name)) : tables
}

// pg-boss's tables in the jobs schema; a `jobs` schema without them is the app's own.
const jobQueue = (schema: string, tables: DbTable[]) =>
  schema === 'jobs' && ['job', 'version'].every((name) => tables.some((table) => table.name === name)) ? tables : []

// The schemas of Protobase's own tables, except the one the target names, which scaffolds it on purpose.
export const protobaseSchemas = (tables: DbTable[], target: Target): ProtobaseSchema[] =>
  [...bySchema(tables)].flatMap(([schema, own]): ProtobaseSchema[] => {
    if (target.schema === schema) return []
    const store = authStore(schema, own)
    if (store.length > 0) return [{ schema, what: 'auth store', tables: store }]
    const queue = jobQueue(schema, own)
    return queue.length > 0 ? [{ schema, what: 'job queue', tables: queue }] : []
  })
