import { sql, type Kysely } from 'kysely'
import type { ResourceModel } from '@protobase/schema'
import { authStoreTables, type TableName } from '../auth-tables'
import type { AdminAuth } from '../create-auth'
import { storeDb } from './store-db'

// The admin store holds password hashes, sessions, tokens and signing keys. Every route that reads tables, the API,
// the Supabase-compatible endpoints, realtime and MCP, reads them through the app's resources only, so a store no
// resource is over is one none of them reads, whatever its tables are called.

type Found = { n: number; schema: string; name: string; database: string }

const quoted = (name: string) => `"${name.replaceAll('"', '""')}"`

// Each table that exists, as the catalogue names it, with its place in `tables` and the database it is in.
const resolve = async (db: Kysely<any>, tables: readonly TableName[]) =>
  (
    await sql<Found>`select t.n::int as n, ns.nspname as schema, c.relname as name, current_database() as database
      from unnest(${tables.map(({ schema, name }) => (schema ? `${quoted(schema)}.${quoted(name)}` : quoted(name)))}::text[]) with ordinality as t(name, n)
      join pg_class c on c.oid = to_regclass(t.name) join pg_namespace ns on ns.oid = c.relnamespace order by t.n`.execute(db)
  ).rows

/**
 * Refuses a resource over a table of the admin store: the user table, a feature's table or the record of migrations,
 * or any table of a guarded schema (`users.guardedSchemas`), by the schema the catalogue finds the table in.
 */
export const checkResourcesOutsideAuthStore = async (db: Kysely<any>, models: readonly ResourceModel[], auth: AdminAuth) => {
  if (models.length === 0) return
  const { tables, schemas } = authStoreTables(auth)
  const store = await resolve(storeDb(auth), tables)
  const same = (a: Found, b: Found) => a.database === b.database && a.schema === b.schema && a.name === b.name
  const guarded = (table: Found) => schemas.includes(table.schema) || store.some((own) => same(own, table))
  const over = (await resolve(db, models.map((model) => model.table))).filter(guarded)
  if (over.length === 0) return
  const named = over.map((table) => `${models[table.n - 1]!.name} (${table.schema}.${table.name})`).join(', ')
  throw new Error(`Resources over the auth store's tables, which hold password hashes, sessions and tokens: ${named}. Remove them from the config; the auth store is read through Better Auth alone.`)
}
