import type { Db } from '@protobase/query'
import type { Deps } from '../deps'
import { fetchReadable } from '../fetch-readable'
import { deletedRows } from '../params'
import { badRequest, notFound } from '../problem'
import { requestAccess, type RequestAccess } from '../request-access'
import type { WriteEvent } from '../types'

const notReplayable = () => notFound('No run of this workflow to replay with this key')

/**
 * Whether the caller reads every step of every run: a replay gives its steps what the replayed run's steps gave, and a
 * re-run copies the steps it keeps, so either needs it. Steps are granted apart from runs, and a row filter or a record
 * rule on them would let the new run show steps the caller cannot read.
 */
export const readsAllSteps = (access: RequestAccess) =>
  access.resolved.operations.read && access.resolved.rowFilter.read === undefined && !access.resolved.recordChecks.includes('read') && access.parents.length === 0

/**
 * Starts a replay of an ended run, which runs from the start on the workflow's current version and that run's input
 * (the table's trigger gave it both), as any run started now, without calling the steps that write: they give what
 * that run's steps gave. So the caller must run the workflow (create runs of it, which the write itself checked on
 * this workflow), read the run, which must be of this workflow, and read all of the run's steps: else 404, as for a
 * run that is not there.
 */
export const startReplay = async (trx: Db, deps: Deps, event: WriteEvent & { after: Record<string, unknown> }) => {
  const who = { user: event.user, ...(event.tenant !== undefined && { tenant: event.tenant }) }
  const runs = await requestAccess(deps, deps.registry.find('workflow_runs')!, who)
  const steps = await requestAccess(deps, deps.registry.find('workflow_steps')!, who)
  if (!runs.resolved.operations.read || !runs.resolved.operations.create || !readsAllSteps(steps)) throw notReplayable()
  const fields = ['workflow_id', 'status'].map((name) => runs.full.fields[name]!)
  const found = await fetchReadable(trx, runs, [String(event.after.rerun_of)], deletedRows(runs.full, false), { fields })
  if (!found || found.record.workflow_id !== event.after.workflow_id) throw notReplayable()
  if (found.record.status !== 'succeeded' && found.record.status !== 'failed') throw badRequest('run-not-ended', `Only a run that ended is replayed; this one is ${String(found.record.status)}`)
}
