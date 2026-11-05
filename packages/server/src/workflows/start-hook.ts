import type { Db } from '@protobase/query'
import type { Runner } from '@protobase/workflows'
import type { Deps } from '../deps'
import { fetchReadable } from '../fetch-readable'
import { deletedRows } from '../params'
import { notFound } from '../problem'
import { requestAccess, requireOperation } from '../request-access'
import type { PipelineHook } from '../types'
import { checkRunInput } from './input-limits'
import { keepEarlierSteps } from './rerun'

/**
 * Starts a run as it is created through the API, in the write's transaction: it refuses an input over its limits and
 * a workflow the caller cannot read in their tenant (404, as the API answers for it), takes a re-run up after the steps
 * it keeps of the run it re-runs, and queues the run's first segment, which runs once the write commits. The resource
 * records who started it, as the run's author.
 */
export const runStartHook = (runner: Runner<Db>, deps: () => Deps, schema: string): PipelineHook => async (event, trx) => {
  if (event.resource.name !== 'workflow_runs' || event.operation !== 'create' || !event.after) return
  checkRunInput(event.after.input)
  const entry = deps().registry.find('workflows')!
  const access = await requestAccess(deps(), entry, { user: event.user, ...(event.tenant !== undefined && { tenant: event.tenant }) })
  requireOperation(access, 'read')
  // Read in the write's own transaction: another would wait for a connection while this one holds its own.
  const key = access.full.fields[access.full.primaryKey[0]!]!
  if (!(await fetchReadable(trx, access, [String(event.after.workflow_id)], deletedRows(access.full, false), { fields: [key] }))) throw notFound(`No ${entry.name} with this key`)
  if (event.after.rerun_of) await keepEarlierSteps(trx, deps(), schema, { ...event, after: event.after })
  await runner.start(trx, String(event.after.id))
}
