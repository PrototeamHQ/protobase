import { Hono } from 'hono'
import type { Deps } from '../deps'
import { fetchReadable } from '../fetch-readable'
import { deletedRows } from '../params'
import { notFound } from '../problem'
import { requestAccess } from '../request-access'
import type { AdminEnv } from '../types'
import { readsTrace } from './trace-access'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * A run's trace, `GET /:run/trace` under the runs' trace path: the steps it ran so far with their input, output and
 * logs, for the run's page. Only for a caller who may read the run and its trace; any other gets the 404 a run that is
 * not there gets.
 */
export const workflowTraceRoute = (deps: Deps, readTrace: (runId: string) => Promise<Record<string, unknown>[]>) => {
  const app = new Hono<AdminEnv>()
  app.get('/:run/trace', async (c) => {
    const entry = deps.registry.find('workflow_runs')
    if (!entry) throw new Error('Run traces are served only in an app with workflows')
    const access = await requestAccess(deps, entry, c.get('session'))
    const run = c.req.param('run')
    const missing = () => notFound('No workflow run with this key')
    if (!uuid.test(run) || !readsTrace(access)) throw missing()
    if (!(await fetchReadable(deps.db, access, [run], deletedRows(access.full, false), { fields: [access.full.fields.id!] }))) throw missing()
    return c.json({ steps: await readTrace(run) })
  })
  return app
}
