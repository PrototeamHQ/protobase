import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import type { SaverRoles } from '../plugin-records'

/** The roles the saver of a run's version holds now in the run's tenant, sorted; none when no user saved it. */
export const runSaverRoles = async (db: Db, schema: string, roles: SaverRoles, runId: string) => {
  const { rows } = await sql<{ saved_by: string | null; tenant_id: string | null }>`select v.saved_by, r.tenant_id from ${sql.id(schema, 'runs')} r
    join ${sql.id(schema, 'versions')} v on v.workflow_id = r.workflow_id and v.version = r.version where r.id = ${runId}`.execute(db)
  const row = rows[0]
  if (!row?.saved_by) return []
  return [...(await roles({ id: row.saved_by, ...(row.tenant_id !== null && { tenant: row.tenant_id }) }))].sort()
}
