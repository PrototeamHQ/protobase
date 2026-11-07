import type { Db } from '@protobase/query'
import type { Deps } from '../deps'
import { fetchReadable } from '../fetch-readable'
import { deletedRows } from '../params'
import { badRequest, notFound } from '../problem'
import { requestAccess } from '../request-access'
import type { WriteEvent } from '../types'
import { readsTrace } from './trace-access'

const notReplayable = () => notFound('No run of this workflow to replay with this key')

/**
 * Starts a replay of an ended run, which runs from the start on that run's version and input (the table's trigger
 * gave it both) without calling the steps that write, which give what that run's trace says they gave. It runs the
 * version's reads live under its bound identities, so the caller must run the workflow (create runs of it, which the
 * write itself checked on this workflow), read the run, which must be of this workflow, and read its trace: else 404,
 * as for a run that is not there.
 */
export const startReplay = async (trx: Db, deps: Deps, event: WriteEvent & { after: Record<string, unknown> }) => {
  const who = { user: event.user, ...(event.tenant !== undefined && { tenant: event.tenant }) }
  const runs = await requestAccess(deps, deps.registry.find('workflow_runs')!, who)
  if (!readsTrace(runs) || !runs.resolved.operations.create) throw notReplayable()
  const fields = ['workflow_id', 'version', 'status'].map((name) => runs.full.fields[name]!)
  const found = await fetchReadable(trx, runs, [String(event.after.rerun_of)], deletedRows(runs.full, false), { fields })
  if (!found || found.record.workflow_id !== event.after.workflow_id || found.record.version !== event.after.version) throw notReplayable()
  if (found.record.status !== 'succeeded' && found.record.status !== 'failed') throw badRequest('run-not-ended', `Only a run that ended is replayed; this one is ${String(found.record.status)}`)
}
