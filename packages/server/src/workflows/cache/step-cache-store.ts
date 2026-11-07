import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import { limits, type KeyShape, type StepCacheStore } from '@protobase/workflows'
import { whoOf } from './cache-who'
import { shapeMemo } from './shape-memo'
import { changedSecrets } from './secret-fingerprints'

type Row = { output: unknown; cached_at: Date; expires_at: Date; secrets: Record<string, string> }

/** At most this many key shapes per step type, and expired entries a write removes. */
const maxShapes = 16
const expiredPerWrite = 100

/**
 * The step cache in the `step_cache` tables of the `workflows` schema, matched on the identity the run's rows give.
 * `fingerprints` gives the current fingerprint of each named secret. A write removes expired entries of its type and
 * keeps at most `limits.cacheEntries` per type and tenant, those soonest to expire going first.
 */
export const postgresStepCache = (db: () => Db, schema: string, fingerprints: (names: readonly string[]) => Record<string, string>): StepCacheStore => {
  const cache = sql.id(schema, 'step_cache')
  const shapesTable = sql.id(schema, 'step_cache_shapes')
  const memo = shapeMemo(async (type) => {
    const { rows } = await sql<{ shape: KeyShape }>`select shape from ${shapesTable} where type = ${type}`.execute(db())
    return rows.map((row) => row.shape)
  })
  return {
    shapes: memo.shapes,
    lookup: async ({ runId, type, identity, keys }) => {
      const { rows } = await sql<Row>`with who as (${whoOf(schema, runId, identity)})
        select c.output, c.cached_at, c.expires_at, c.secrets from ${cache} c join who on c.who = who.who
        where c.type = ${type} and c.key = any(${keys}) and c.expires_at > now() order by c.cached_at desc limit 1`.execute(db())
      const row = rows[0]
      if (!row) return
      return { output: row.output, cachedAt: row.cached_at, expiresAt: row.expires_at, secretsChanged: changedSecrets(row.secrets, fingerprints(Object.keys(row.secrets))) }
    },
    write: async ({ runId, type, identity, key, shape, output, seconds, secrets }) => {
      const { rows } = await sql<{ tenant_id: string | null }>`with who as (${whoOf(schema, runId, identity)})
        insert into ${cache} (type, key, who, tenant_id, output, secrets, expires_at)
        select ${type}, ${key}, who.who, who.tenant_id, ${JSON.stringify(output ?? null)}::jsonb, ${JSON.stringify(fingerprints(secrets))}::jsonb, now() + make_interval(secs => ${seconds})
        from who
        on conflict (type, key, who) do update set output = excluded.output, secrets = excluded.secrets, cached_at = now(), expires_at = excluded.expires_at
        returning tenant_id`.execute(db())
      if (rows.length === 0) return
      await sql`delete from ${cache} where ctid in (select ctid from ${cache} where type = ${type} and expires_at <= now() limit ${expiredPerWrite})`.execute(db())
      const tenant = rows[0]!.tenant_id
      const ofTenant = tenant === null ? sql`tenant_id is null` : sql`tenant_id = ${tenant}`
      await sql`delete from ${cache} where ctid in (select ctid from ${cache} where type = ${type} and ${ofTenant}
        order by expires_at desc offset ${limits.cacheEntries})`.execute(db())
      if (!('reads' in shape)) return
      const added = await sql`insert into ${shapesTable} (type, shape) select ${type}, ${JSON.stringify(shape)}::jsonb
        where (select count(*) from ${shapesTable} where type = ${type}) < ${maxShapes} on conflict do nothing returning type`.execute(db())
      if (added.rows.length > 0) memo.forget(type)
    },
  }
}
