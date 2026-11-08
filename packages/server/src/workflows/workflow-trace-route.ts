import { workflowRunParam, workflowRunTraceRoute, workflowTraceAfterParam } from '@protobase/schema/internal'
import { Hono } from 'hono'
import type { Deps } from '../deps'
import { fetchReadable } from '../fetch-readable'
import { deletedRows } from '../params'
import { badRequest, notFound } from '../problem'
import { requestAccess } from '../request-access'
import type { AdminEnv } from '../types'
import { readsTrace } from './trace-access'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * A run's trace, `GET /:run/trace` under the runs' trace path: the steps it ran so far with their input, output and
 * logs, for the run's page, which follows a run by asking only for the steps after those it has (`after`). Only for a
 * caller who may read the run and its trace; any other gets the 404 a run that is not there gets.
 */
export const workflowTraceRoute = (deps: Deps, readTrace: (runId: string) => Promise<Record<string, unknown>[]>) => {
  const app = new Hono<AdminEnv>()
  app.get(workflowRunTraceRoute, async (c) => {
    const entry = deps.registry.find('workflow_runs')
    if (!entry) throw new Error('Run traces are served only in an app with workflows')
    const access = await requestAccess(deps, entry, c.get('session'))
    const run = c.req.param(workflowRunParam)
    const missing = () => notFound('No workflow run with this key')
    const after = Number(c.req.query(workflowTraceAfterParam) ?? 0)
    if (!Number.isSafeInteger(after) || after < 0) throw badRequest('invalid-parameter', `"${workflowTraceAfterParam}" is the number of steps the caller has, a whole number from 0`, { errors: [{ parameter: workflowTraceAfterParam, message: 'Not a whole number from 0' }] })
    if (!uuid.test(run) || !readsTrace(access)) throw missing()
    if (!(await fetchReadable(deps.db, access, [run], deletedRows(access.full, false), { fields: [access.full.fields.id!] }))) throw missing()
    const steps = await readTrace(run)
    const from = after <= steps.length ? after : 0
    return c.json({ from, steps: steps.slice(from) })
  })
  return app
}
