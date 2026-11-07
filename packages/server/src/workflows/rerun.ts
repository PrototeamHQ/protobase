import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import { keptAssigned, rerunFromSteps, rerunSteps, type Definition, type EarlierStep } from '@protobase/workflows'
import type { Deps } from '../deps'
import { fetchReadable } from '../fetch-readable'
import { deletedRows } from '../params'
import { badRequest, notFound } from '../problem'
import { requestAccess, requireOperation } from '../request-access'
import type { WriteEvent } from '../types'
import { readsAllSteps } from './replay'

/**
 * Starts a re-run where the failed run it re-runs left off, or with `rerun_from` from that state of a run that ended:
 * refuses a run the caller cannot read, or whose steps they cannot all read (404), one of another workflow, one that did not fail or has not ended, and
 * copies the steps a re-run keeps to the new run, in one statement, so the runner takes it up after them on the version
 * it runs. The table's trigger gave it the earlier run's input.
 */
export const keepEarlierSteps = async (trx: Db, deps: Deps, schema: string, event: WriteEvent & { after: Record<string, unknown> }) => {
  const run = String(event.after.id)
  const earlier = String(event.after.rerun_of)
  const access = await requestAccess(deps, deps.registry.find('workflow_runs')!, { user: event.user, ...(event.tenant !== undefined && { tenant: event.tenant }) })
  requireOperation(access, 'read')
  // The kept steps are copied to the new run, so the caller must read every one of them, as for a replay
  if (!readsAllSteps(await requestAccess(deps, deps.registry.find('workflow_steps')!, { user: event.user, ...(event.tenant !== undefined && { tenant: event.tenant }) }))) throw notFound('No run of this workflow to re-run with this key')
  const found = await fetchReadable(trx, access, [earlier], deletedRows(access.full, false), { fields: [access.full.fields.workflow_id!, access.full.fields.status!] })
  if (!found || found.record.workflow_id !== event.after.workflow_id) throw notFound('No run of this workflow to re-run with this key')
  const from = event.after.rerun_from as string | null | undefined
  if (from && found.record.status !== 'failed' && found.record.status !== 'succeeded') throw badRequest('run-not-ended', `Only a run that ended is re-run from a step; this one is ${String(found.record.status)}`)
  if (!from && found.record.status !== 'failed') throw badRequest('run-not-failed', `Only a failed run is re-run from where it failed; this one is ${String(found.record.status)}`)
  const { rows: versions } = await sql<{ definition: Definition }>`select v.definition from ${sql.id(schema, 'runs')} r
    join ${sql.id(schema, 'versions')} v on v.workflow_id = r.workflow_id and v.version = r.version where r.id = ${run}`.execute(trx)
  const steps = sql.id(schema, 'steps')
  const { rows } = await sql<EarlierStep & { id: string; output: unknown; assigned: unknown }>`select id, scope, seq, state, status, next, output, assigned from ${steps} where run_id = ${earlier}`.execute(trx)
  const machine = versions[0]!.definition.stateMachine
  const { rows: earlierVersions } = await sql<{ definition: Definition }>`select v.definition from ${sql.id(schema, 'runs')} r
    join ${sql.id(schema, 'versions')} v on v.workflow_id = r.workflow_id and v.version = r.version where r.id = ${earlier}`.execute(trx)
  const ran = earlierVersions[0]!.definition.stateMachine
  const kept = from ? rerunFromSteps(machine, rows, from) : rerunSteps(machine, rows)
  if ('problem' in kept) throw badRequest('rerun-refused', `The run cannot be re-run on the workflow as it is now: ${kept.problem}`)
  if (kept.steps.length === 0) return
  const columns = sql.raw('scope, seq, state, type, status, attempt, input, output, assigned, next, resume_at, error, cause, logs, started_at, finished_at')
  await sql`insert into ${steps} (run_id, tenant_id, ${columns}) select ${run}, tenant_id, ${columns} from ${steps}
    where id in (${sql.join(kept.steps.map((step) => step.id))})`.execute(trx)
  for (const step of kept.steps) {
    const assigned = keptAssigned(machine, ran, step)
    if (assigned) await sql`update ${steps} set assigned = ${JSON.stringify(assigned)}::jsonb where run_id = ${run} and scope = ${step.scope} and seq = ${step.seq}`.execute(trx)
  }
}
