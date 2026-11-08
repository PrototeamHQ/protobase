import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import { rerunFrom, rerunProblem, type Definition, type EarlierCheckpoint, type Runner, type TraceMode } from '@protobase/workflows'
import type { Deps } from '../deps'
import { fetchReadable } from '../fetch-readable'
import { deletedRows } from '../params'
import { badRequest, notFound } from '../problem'
import { requestAccess } from '../request-access'
import type { WriteEvent } from '../types'
import { postgresRunStore } from './store'
import { readsTrace } from './trace-access'

const notRerun = () => notFound('No run of this workflow to re-run with this key')

/**
 * Starts a re-run where the failed run it re-runs left off, or with `rerun_from` from that state of a run that ended.
 * It refuses a run the caller cannot read, or whose trace they cannot read, as the re-run carries on that run's values
 * (404), one of another workflow, and one that did not fail or has not ended. A re-run where the run failed copies that
 * run's checkpoints to the new run, in one statement, so the runner takes each scope up from its last one on the
 * workflow's version now, from the first try of its state and at the re-run's own time, as a run goes on after a crash:
 * steps since the last checkpoint run again, recorded writes before it never. A re-run from a state takes the steps
 * before it from the run's trace, saves the checkpoint they lead to and keeps them in its own trace; it is refused for a
 * run that kept no trace. The table's trigger gave it the earlier run's input.
 */
export const keepEarlierCheckpoints = async (trx: Db, deps: Deps, runner: Runner<Db>, schema: string, event: WriteEvent & { after: Record<string, unknown> }) => {
  const run = String(event.after.id)
  const earlier = String(event.after.rerun_of)
  const access = await requestAccess(deps, deps.registry.find('workflow_runs')!, { user: event.user, ...(event.tenant !== undefined && { tenant: event.tenant }) })
  if (!readsTrace(access)) throw notRerun()
  const found = await fetchReadable(trx, access, [earlier], deletedRows(access.full, false), { fields: [access.full.fields.workflow_id!, access.full.fields.status!] })
  if (!found || found.record.workflow_id !== event.after.workflow_id) throw notRerun()
  const from = event.after.rerun_from as string | null | undefined
  if (from && found.record.status !== 'failed' && found.record.status !== 'succeeded') throw badRequest('run-not-ended', `Only a run that ended is re-run from a step; this one is ${String(found.record.status)}`)
  if (!from && found.record.status !== 'failed') throw badRequest('run-not-failed', `Only a failed run is re-run from where it failed; this one is ${String(found.record.status)}`)
  const version = async (id: string) => {
    const { rows } = await sql<{ definition: Definition }>`select v.definition from ${sql.id(schema, 'runs')} r
      join ${sql.id(schema, 'versions')} v on v.workflow_id = r.workflow_id and v.version = r.version where r.id = ${id}`.execute(trx)
    return rows[0]!.definition
  }
  const definition = await version(run)
  const refused = (problem: string) => badRequest('rerun-refused', `The run cannot be re-run on the workflow as it is now: ${problem}`)
  const checkpoints = sql.id(schema, 'checkpoints')
  if (!from) {
    const { rows } = await sql<EarlierCheckpoint>`select scope, next from ${checkpoints} where run_id = ${earlier}`.execute(trx)
    const problem = rerunProblem(definition.stateMachine, rows)
    if (problem) throw refused(problem)
    await sql`insert into ${checkpoints} (run_id, scope, seq, follows, state, type, status, fetched_at, next, value, variables, attempt, failures, visits, resume_at, clock)
      select ${run}, scope, seq, follows, state, type, status, fetched_at, next, value, variables, 1, '[]'::jsonb, visits, null, now()
      from ${checkpoints} where run_id = ${earlier}`.execute(trx)
    return
  }
  const steps = await runner.readTrace(earlier)
  if (!steps) throw badRequest('rerun-no-trace', 'This run did not keep its trace, so it cannot be re-run from a step')
  const kept = rerunFrom(definition.stateMachine, (await version(earlier)).stateMachine, steps, from, new Date())
  if ('problem' in kept) throw refused(kept.problem)
  if (kept.checkpoint) await postgresRunStore(schema).save(trx, run, [kept.checkpoint])
  await runner.keepSteps({ id: run, definition, trace: (event.after.trace as TraceMode | null | undefined) ?? null }, kept.kept)
}
