import postgres from 'postgres'
import type { LiveStore, StoreNames } from '@protobase/server/internal'

/**
 * The auth store at `url` as its schema has it, read once in a read-only transaction: every relation of the store's
 * schema with its kind and columns, and the versions its `auth_migrations` records. Refuses a store without that
 * table, one made before 0.48, which `protobase auth migration` adopts first.
 */
export const readLiveStore = async (url: string, names: StoreNames): Promise<LiveStore> => {
  const sql = postgres(url, { max: 1, onnotice: () => {} })
  const record = names.names.table('auth_migrations')
  try {
    return await sql.begin('read only', async (tx) => {
      const rows = await tx<{ name: string; kind: string; columns: string[] }[]>`
        select c.relname as name, c.relkind as kind,
          array(select a.attname::text from pg_catalog.pg_attribute a where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped order by a.attnum) as columns
        from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
        where n.nspname = coalesce(${names.schema ?? null}::text, current_schema()) and c.relkind in ('r', 'p', 'v', 'm', 'f')`
      const relations = Object.fromEntries(rows.map(({ name, kind, columns }) => [name, { kind, columns }]))
      if (!relations[record.name]) {
        throw new Error(`The auth store has no ${record.name} table, as a store made before 0.48: adopt it with \`protobase auth migration\` and apply that file first`)
      }
      const versions = await tx.unsafe<{ version: number }[]>(`select ${String(record.columns.version)} as version from ${String(record)} order by 1`)
      return { versions: versions.map(({ version }) => Number(version)), relations }
    })
  } finally {
    await sql.end()
  }
}
