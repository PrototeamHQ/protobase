import type { Db } from '@protobase/query'
import type { Deps } from '../deps'
import { fetchReadable } from '../fetch-readable'
import { deletedRows } from '../params'
import { badRequest, notFound } from '../problem'
import { requestAccess, type RequestAccess } from '../request-access'
import type { WriteEvent } from '../types'

const notReplayable = () => notFound('No run of this workflow to replay with this key')

// The replay gives its steps what the replayed run's steps gave, so the caller must read every one of them: steps are
// granted apart from runs, and a row filter or a record rule on them would let the replay show steps they cannot read.
const readsAllSteps = (access: RequestAccess) =>
  access.resolved.operations.read && access.resolved.rowFilter.read === undefined && !access.resolved.recordChecks.includes('read') && access.parents.length === 0

/**
 * Starts a replay of an ended run, which runs from the start on that run's version and input (the table's trigger
 * gave it both) without calling the steps that write. It reads that run's steps live under the version's bound
 * identities, so the caller must run the workflow (create runs of it, which the write itself checked on this
 * workflow), read the run, which must be of this workflow, and read all of the run's steps: else 404, as for a run that
 * is not there.
 */
export const startReplay = async (trx: Db, deps: Deps, event: WriteEvent & { after: Record<string, unknown> }) => {
  const who = { user: event.user, ...(event.tenant !== undefined && { tenant: event.tenant }) }
  const runs = await requestAccess(deps, deps.registry.find('workflow_runs')!, who)
  const steps = await requestAccess(deps, deps.registry.find('workflow_steps')!, who)
  if (!runs.resolved.operations.read || !runs.resolved.operations.create || !readsAllSteps(steps)) throw notReplayable()
  const fields = ['workflow_id', 'version', 'status'].map((name) => runs.full.fields[name]!)
  const found = await fetchReadable(trx, runs, [String(event.after.rerun_of)], deletedRows(runs.full, false), { fields })
  if (!found || found.record.workflow_id !== event.after.workflow_id || found.record.version !== event.after.version) throw notReplayable()
  if (found.record.status !== 'succeeded' && found.record.status !== 'failed') throw badRequest('run-not-ended', `Only a run that ended is replayed; this one is ${String(found.record.status)}`)
}
