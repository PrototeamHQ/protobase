import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import type { Runner } from '@protobase/workflows'
import type { PipelineHook } from '../types'

/**
 * Starts a run as it is created through the API, in the write's transaction: it queues the run's first segment, which
 * runs once the write commits, and records who started it.
 */
export const runStartHook = (schema: string, runner: Runner<Db>): PipelineHook => async (event, trx) => {
  if (event.resource.name !== 'workflow_runs' || event.operation !== 'create' || !event.after) return
  const id = String(event.after.id)
  await sql`update ${sql.id(schema, 'runs')} set started_by = ${String(event.user.id)} where id = ${id}`.execute(trx)
  await runner.start(trx, id)
}
