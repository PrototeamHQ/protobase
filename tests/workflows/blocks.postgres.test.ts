import { sql, type Kysely } from 'kysely'
// Where runs keep their traces.
const trace = await traceFiles()

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { defineRoles } from '@protobase/schema'
import { configExports, createAdmin, startJobs, workflowsMigration, type JobsRuntime, type WorkflowsOptions } from '@protobase/server'
import { workflowsModule } from '@protobase/server/internal'
import { workflowRunTracePath } from '@protobase/schema/internal'
import type { Plugin } from '@protobase/workflows/plugin'
import { openPostgresDatabase, postgresTemplateReady, statementTimeoutMs, type PostgresDatabase } from '../../test-support/postgres-database'
import { traceFiles } from './support/run-trace'

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

const roles = defineRoles<'workflows' | 'workflow_versions' | 'workflow_runs'>({ builder: ['workflows.*', 'workflow_versions.read', 'workflow_runs.*'] })
const secretValue = 'block-secret-value-1234'
// The roles the workflows' last editor holds now, which a test changes.
let saverHolds = ['builder']

// A fetch of a link that counts its calls, and a step that returns nothing.
const fetched: unknown[] = []
const plugin: Plugin = {
  name: 'acme',
  label: 'Acme',
  steps: {
    fetch: { label: 'Fetch', description: 'Fetches a link.', input: { type: 'object' }, run: async ({ input }) => (fetched.push(input), { body: `body of ${String(input.url)}`, n: fetched.length }) },
    nothing: { label: 'Nothing', description: 'Returns nothing.', input: { type: 'object' }, run: async () => (fetched.push('nothing'), undefined) },
  },
}

const blockOf = (resource: string, extra: Record<string, unknown> = {}) => ({
  trigger: { manual: {} },
  stateMachine: {
    QueryLanguage: 'JSONata',
    StartAt: 'Keep',
    States: {
      Keep: {
        Type: 'Block',
        Arguments: { url: '{% $states.context.Execution.Input.url %}' },
        Processor: { StartAt: 'Fetch', States: { Fetch: { Type: 'Task', Resource: resource, Arguments: { url: '{% $states.context.Execution.Input.url %}', ...extra }, End: true } } },
        Cache: { Ttl: '1 hour' },
        Assign: { got: '{% $states.result %}' },
        Next: 'Done',
      },
      Done: { Type: 'Succeed', Output: '{% $got %}' },
    },
  },
})

describe.skipIf(!(await postgresTemplateReady('jobs')))("blocks on the app's database", () => {
  let pg: PostgresDatabase
  let db: Kysely<any>
  let admin: ReturnType<typeof createAdmin>
  let runtime: JobsRuntime | undefined
  const errors: unknown[] = []

  beforeAll(async () => {
    vi.stubEnv('BLOCK_KEY', secretValue)
    vi.stubEnv('PROTOBASE_SECRET', 'app-secret-for-the-blocks-test')
    const workflows: WorkflowsOptions = { savedByRoles: async () => saverHolds, plugins: [{ plugin, source: 'acme' }], secrets: ['BLOCK_KEY'] }
    pg = await openPostgresDatabase('jobs')
    db = pg.db
    await pg.exec((await workflowsMigration(db, workflows))!)
    const { resources, views } = configExports(workflowsModule(workflows))
    admin = createAdmin({ resources, views, db, files: trace.files, authenticate: (request) => ({ user: { id: 'ada', roles: ['builder'] }, tenant: request.headers.get('x-tenant')! }), workflows, options: { statementTimeoutMs, roles } })
    runtime = await startJobs({ db, jobs: admin.jobs, pollSeconds: 0.5, shutdownSeconds: 5, onError: (error) => errors.push(error) })
  })

  afterAll(async () => {
    await trace.folder.remove()
    await runtime?.stop()
    await pg?.close()
    vi.unstubAllEnvs()
    expect(errors).toEqual([])
  })

  const request = (tenant: string, method: string, path: string, body?: unknown) =>
    admin.request(`/api/v1${path}`, { method, headers: { 'content-type': 'application/json', 'x-tenant': tenant }, ...(body !== undefined && { body: JSON.stringify(body) }) })
  const create = async (tenant: string, path: string, body: unknown) => {
    const response = await request(tenant, 'POST', path, body)
    if (response.status !== 201) throw new Error(await response.text())
    return (await response.json()).id as string
  }
  const ended = async (id: string) => {
    await vi.waitFor(async () => expect((await sql<{ status: string }>`select status from workflows.runs where id = ${id}`.execute(db)).rows[0]!.status).toMatch(/succeeded|failed/), { timeout: 20_000, interval: 50 })
    return (await sql<{ status: string; output: unknown; error: string | null }>`select status, output, error from workflows.runs where id = ${id}`.execute(db)).rows[0]!
  }
  const run = async (tenant: string, workflow: string, input: unknown) => {
    const id = await create(tenant, '/workflow_runs', { workflow_id: workflow, input })
    return { id, ...(await ended(id)) }
  }
  const blockRuns = async (parent: string) => (await sql<{ id: string; tenant_id: string; started_by: string; block_state: string; input: unknown }>`select id, tenant_id, started_by, block_state, input from workflows.runs where block_of = ${parent}`.execute(db)).rows

  it('runs a block reached from two runs with the same key once, as a run of its own with its own trace', async () => {
    const workflow = await create('1', '/workflows', { name: 'Fetch once', definition: blockOf('acme:fetch') })
    const before = fetched.length
    const first = await run('1', workflow, { url: 'https://files.test/a?sig=1' })
    const second = await run('1', workflow, { url: 'https://files.test/a?sig=1' })
    expect(first).toMatchObject({ status: 'succeeded', output: { body: 'body of https://files.test/a?sig=1' } })
    expect(second.output).toEqual(first.output)
    expect(fetched.length - before).toBe(1)
    const [child] = await blockRuns(first.id)
    expect(child).toMatchObject({ tenant_id: '1', started_by: `run:${first.id}`, block_state: 'Keep', input: { url: 'https://files.test/a?sig=1' } })
    expect(await blockRuns(second.id)).toEqual([])
    expect((await trace.steps(db, child!.id)).map((step) => step.state)).toEqual(['Fetch'])
    const blockStep = (await trace.steps(db, second.id)).find((step) => step.state === 'Keep') as { run?: string }
    expect(blockStep.run).toBe(child!.id)
    // A block's run counts for nothing in the workflow's status, and opens from its block's step, not the workflow's runs.
    const listed = await (await request('1', 'GET', `/workflow_runs?filter=${encodeURIComponent(`workflow_id = "${workflow}" AND isNull(block_of)`)}`)).json()
    expect(listed.items.map((item: { id: string }) => item.id).sort()).toEqual([first.id, second.id].sort())
  })

  it("keeps an empty result, and never serves one tenant's entry to another", async () => {
    const workflow = await create('1', '/workflows', { name: 'Nothing', definition: blockOf('acme:nothing') })
    const before = fetched.length
    await run('1', workflow, { url: 'u' })
    expect((await run('1', workflow, { url: 'u' })).status).toBe('succeeded')
    expect(fetched.length - before).toBe(1)
    const other = await create('2', '/workflows', { name: 'Nothing', definition: blockOf('acme:nothing') })
    await run('2', other, { url: 'u' })
    expect(fetched.length - before).toBe(2)
  })

  it("reuses no result once the saver's roles change, and none while the saver holds no role", async () => {
    const workflow = await create('1', '/workflows', { name: 'Roles', definition: blockOf('acme:fetch') })
    const before = fetched.length
    await run('1', workflow, { url: 'https://files.test/roles' })
    await run('1', workflow, { url: 'https://files.test/roles' })
    expect(fetched.length - before).toBe(1)
    saverHolds = ['builder', 'viewer']
    await run('1', workflow, { url: 'https://files.test/roles' })
    expect(fetched.length - before).toBe(2)
    saverHolds = []
    await run('1', workflow, { url: 'https://files.test/roles' })
    await run('1', workflow, { url: 'https://files.test/roles' })
    expect(fetched.length - before).toBe(4)
    saverHolds = ['builder']
    await run('1', workflow, { url: 'https://files.test/roles' })
    expect(fetched.length - before).toBe(4)
  })

  it('keeps no secret in the cache, and none of its read values in the key', async () => {
    const workflow = await create('1', '/workflows', { name: 'Signed', definition: blockOf('acme:fetch', { token: '{% $states.context.Secrets.BLOCK_KEY %}' }) })
    await run('1', workflow, { url: 'https://files.test/b?sig=readable' })
    const { rows } = await sql<{ key: string; text: string }>`select key, (key || who::text || output::text || secrets::text) as text from workflows.step_cache where type like 'block:%'`.execute(db)
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(row.key).toMatch(/^[0-9a-f]{64}$/)
      expect(row.text).not.toContain(secretValue)
    }
    expect(rows.map((row) => row.key).join()).not.toContain('sig=readable')
  })

  it("refuses the block fields on a run's create, and another tenant cannot read or replay a block's run", async () => {
    const workflow = await create('1', '/workflows', { name: 'Guarded', definition: blockOf('acme:fetch') })
    const parent = await run('1', workflow, { url: 'https://files.test/c' })
    const [child] = await blockRuns(parent.id)
    for (const field of [{ block_of: parent.id }, { block_state: 'Keep' }, { block_visit: '|0' }]) {
      const response = await request('1', 'POST', '/workflow_runs', { workflow_id: workflow, input: {}, ...field })
      expect(response.status).toBe(400)
    }
    expect((await request('2', 'GET', `/workflow_runs/${child!.id}`)).status).toBe(404)
    const traceOf = (tenant: string) => admin.request(workflowRunTracePath('/api', child!.id), { headers: { 'x-tenant': tenant } })
    expect((await traceOf('1')).status).toBe(200)
    const refused = await traceOf('2')
    expect(refused.status).toBe(404)
    expect(await refused.text()).not.toContain('files.test')
    const replay = await request('2', 'POST', '/workflow_runs', { workflow_id: workflow, rerun_of: child!.id, replay: true })
    expect(replay.status).not.toBe(201)
    expect((await sql<{ count: number }>`select count(*)::integer as count from workflows.runs where rerun_of = ${child!.id}`.execute(db)).rows[0]!.count).toBe(0)
    // Its own tenant replays it by itself: the Block's steps alone, on its input.
    const replayed = await create('1', '/workflow_runs', { workflow_id: workflow, rerun_of: child!.id, replay: true })
    expect(await ended(replayed)).toMatchObject({ status: 'succeeded', output: { body: 'body of https://files.test/c' } })
    expect((await sql<{ block_state: string; block_of: string | null }>`select block_state, block_of from workflows.runs where id = ${replayed}`.execute(db)).rows[0]).toEqual({ block_state: 'Keep', block_of: null })
  })
})
