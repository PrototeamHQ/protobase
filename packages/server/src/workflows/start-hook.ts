import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import type { Runner } from '@protobase/workflows'
import type { Deps } from '../deps'
import { readRecord } from '../read-service'
import type { PipelineHook } from '../types'
import { checkRunInput } from './input-limits'

/**
 * Starts a run as it is created through the API, in the write's transaction: it refuses an input over its limits and
 * a workflow the caller cannot read in their tenant (404, as the API answers for it), records who started it, and
 * queues the run's first segment, which runs once the write commits.
 */
export const runStartHook = (schema: string, runner: Runner<Db>, deps: () => Deps): PipelineHook => async (event, trx) => {
  if (event.resource.name !== 'workflow_runs' || event.operation !== 'create' || !event.after) return
  checkRunInput(event.after.input)
  const entry = deps().registry.find('workflows')!
  await readRecord(deps(), entry, { user: event.user, ...(event.tenant !== undefined && { tenant: event.tenant }) }, [String(event.after.workflow_id)])
  const id = String(event.after.id)
  await sql`update ${sql.id(schema, 'runs')} set started_by = ${String(event.user.id)} where id = ${id}`.execute(trx)
  await runner.start(trx, id)
}
