import { sql } from 'kysely'
import type { CacheIdentity } from '@protobase/workflows'

/**
 * Who a call of a run acts as, from the run's own rows, never from the step: the run's tenant always; the version's
 * saver and the person who turned it on where the type acts as them; and for a type's connection, the account the
 * version binds to it with the person who turned it on.
 */
export const whoOf = (schema: string, runId: string, { saver, enabler, connection }: CacheIdentity) => {
  const parts = [sql`jsonb_build_object('tenant', r.tenant_id)`]
  if (saver) parts.push(sql`jsonb_build_object('saver', v.saved_by)`)
  if (enabler || connection) parts.push(sql`jsonb_build_object('enabler', v.enabled_by)`)
  if (connection) parts.push(sql`jsonb_build_object('connection', v.definition -> 'connections' ->> ${connection})`)
  return sql`select ${sql.join(parts, sql` || `)} as who, r.tenant_id from ${sql.id(schema, 'runs')} r
    join ${sql.id(schema, 'versions')} v on v.workflow_id = r.workflow_id and v.version = r.version where r.id = ${runId}`
}
