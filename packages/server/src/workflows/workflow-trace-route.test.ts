import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import { defineRoles } from '@protobase/schema'
import { workflowResources } from '@protobase/schema/internal'
import type { Deps } from '../deps'
import { createErrorHandler } from '../error-handler'
import { buildRegistry } from '../registry'
import type { AdminEnv } from '../types'
import { workflowTraceRoute } from './workflow-trace-route'

// Whether the caller may read the run row, which the database answers through the run's tenant and row rules.
const readable = vi.hoisted(() => ({ run: true }))
vi.mock('../fetch-readable', () => ({ fetchReadable: vi.fn(async (_db: unknown, _access: unknown, key: string[]) => (readable.run ? { record: { id: key[0] } } : undefined)) }))

const roles = defineRoles<'workflow_runs'>({ reader: ['workflow_runs.read'], other: [] })
const deps = { registry: buildRegistry([workflowResources('workflows').workflowRuns]), accessOptions: { roles }, settingsResources: new Set() } as unknown as Deps
const run = '6f1c2a54-0d3e-4b6a-9a51-2f6c8e7d9b10'
const steps = [{ scope: '', seq: 0, state: 'Fetch', status: 'succeeded', output: { n: 1 } }]

// The route as the app mounts it, behind a guard that signs the caller in with `role`
const serve = (role: string, readTrace = vi.fn(async () => steps)) => {
  const app = new Hono<AdminEnv>()
  app.onError(createErrorHandler(undefined))
  app.use('*', async (c, next) => {
    c.set('session', { user: { id: '1', roles: [role] }, tenant: '1' })
    await next()
  })
  app.route('/', workflowTraceRoute(deps, readTrace))
  return { app, readTrace }
}

describe("a run's trace, as its page reads it", () => {
  it('serves the steps of the trace to whoever reads the run', async () => {
    const { app, readTrace } = serve('reader')
    const answer = await app.request(`/${run}/trace`)
    expect(answer.status).toBe(200)
    expect(await answer.json()).toEqual({ steps })
    expect(readTrace).toHaveBeenCalledWith(run)
  })

  it('answers 404, reading no trace, to a caller who may not read runs or this run, and for a key that is no run id', async () => {
    for (const [role, key, row] of [['other', run, true], ['reader', 'not-a-run', true], ['reader', run, false]] as const) {
      readable.run = row
      const { app, readTrace } = serve(role)
      expect((await app.request(`/${key}/trace`)).status).toBe(404)
      expect(readTrace).not.toHaveBeenCalled()
    }
    readable.run = true
  })
})
