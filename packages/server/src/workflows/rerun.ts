import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import { rerunProblem, type Definition, type EarlierCheckpoint } from '@protobase/workflows'
import type { Deps } from '../deps'
import { fetchReadable } from '../fetch-readable'
import { deletedRows } from '../params'
import { badRequest, notFound } from '../problem'
import { requestAccess, requireOperation } from '../request-access'
import type { WriteEvent } from '../types'

/**
 * Starts a re-run where the failed run it re-runs left off: refuses a run the caller cannot read (404), one of another
 * workflow and one that did not fail, and copies that run's checkpoints to the new run, in one statement, so the runner
 * takes each scope up from its last one on the workflow's version now, from the first try of its state and at the
 * re-run's own time, as a run goes on after a crash: steps since the last checkpoint run again, recorded writes before
 * it never. The table's trigger gave it the earlier run's input.
 */
export const keepEarlierCheckpoints = async (trx: Db, deps: Deps, schema: string, event: WriteEvent & { after: Record<string, unknown> }) => {
  const run = String(event.after.id)
  const earlier = String(event.after.rerun_of)
  const access = await requestAccess(deps, deps.registry.find('workflow_runs')!, { user: event.user, ...(event.tenant !== undefined && { tenant: event.tenant }) })
  requireOperation(access, 'read')
  const found = await fetchReadable(trx, access, [earlier], deletedRows(access.full, false), { fields: [access.full.fields.workflow_id!, access.full.fields.status!] })
  if (!found || found.record.workflow_id !== event.after.workflow_id) throw notFound('No run of this workflow to re-run with this key')
  if (found.record.status !== 'failed') throw badRequest('run-not-failed', `Only a failed run is re-run; this one is ${String(found.record.status)}`)
  const { rows: versions } = await sql<{ definition: Definition }>`select v.definition from ${sql.id(schema, 'runs')} r
    join ${sql.id(schema, 'versions')} v on v.workflow_id = r.workflow_id and v.version = r.version where r.id = ${run}`.execute(trx)
  const checkpoints = sql.id(schema, 'checkpoints')
  const { rows } = await sql<EarlierCheckpoint>`select scope, next from ${checkpoints} where run_id = ${earlier}`.execute(trx)
  const problem = rerunProblem(versions[0]!.definition.stateMachine, rows)
  if (problem) throw badRequest('rerun-refused', `The run cannot be re-run on the workflow as it is now: ${problem}`)
  await sql`insert into ${checkpoints} (run_id, scope, seq, follows, state, type, status, fetched_at, next, value, variables, attempt, failures, visits, resume_at, clock)
    select ${run}, scope, seq, follows, state, type, status, fetched_at, next, value, variables, 1, '[]'::jsonb, visits, null, now()
    from ${checkpoints} where run_id = ${earlier}`.execute(trx)
}
