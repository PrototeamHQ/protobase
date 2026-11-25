import postgres from 'postgres'
import { versionRecordRefusal, versionRecordTable, type AppliedStep, type LiveStore, type StoreNames } from '@protobase/server/internal'

/**
 * The auth store at `url` as its schema has it, read once in a read-only transaction: every relation of the store's
 * schema with its kind and columns, and the parts of steps it recorded in `auth_steps`. Refuses a store without it:
 * one that records versions instead, which Protobase 0.130 moves to `auth_steps` first, or one made before 0.48, which
 * `protobase auth migration` adopts first.
 */
export const readLiveStore = async (url: string, names: StoreNames): Promise<LiveStore> => {
  const sql = postgres(url, { max: 1, onnotice: () => {} })
  const record = versionRecordTable(names)
  const steps = names.names.table('auth_steps')
  try {
    return await sql.begin('read only', async (tx) => {
      const rows = await tx<{ name: string; kind: string; columns: string[] }[]>`
        select c.relname as name, c.relkind as kind,
          array(select a.attname::text from pg_catalog.pg_attribute a where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped order by a.attnum) as columns
        from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
        where n.nspname = coalesce(${names.schema ?? null}::text, current_schema()) and c.relkind in ('r', 'p', 'v', 'm', 'f')`
      const relations = Object.fromEntries(rows.map(({ name, kind, columns }) => [name, { kind, columns }]))
      if (relations[steps.name]) {
        const { module, step, target } = steps.columns
        const applied = await tx.unsafe<AppliedStep[]>(`select ${String(module)} as module, ${String(step)} as step, ${String(target)} as target from ${String(steps)}`)
        return { applied: applied.map((part) => ({ ...part, step: Number(part.step) })), relations }
      }
      if (relations[record.name]) throw new Error(versionRecordRefusal(record.name))
      throw new Error(`The auth store has no ${steps.name}, as a store made before 0.48: adopt it with \`protobase auth migration\` and apply that file first`)
    })
  } finally {
    await sql.end()
  }
}
