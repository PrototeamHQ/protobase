import { createHmac } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { sql } from 'kysely'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { defineRoles } from '@protobase/schema'
import { configExports } from '../src/config-exports'
import { createUser } from '../src/better-auth/users'
import { startJobs, type JobsRuntime } from '../src/jobs/runtime'
import { jobsSchemaMigration } from '../src/jobs/schema'
import { workflowsMigration } from '../src/workflows/schema'
import { workflowsModule } from '../src/workflows/workflows-module'
import { localFiles } from '../src/files/local-files'
import { tempDir } from '../src/files/testing/temp-dir'
import type { WorkflowsOptions } from '../src/workflows/options'
import { openPostgresDatabase, postgresTemplateReady, type PostgresDatabase } from '../../../test-support/postgres-database'
import { password, serveMcp } from './support/mcp-app'

// An MCP client signed in as a person finds, makes, changes and test-runs workflows on the app's MCP endpoint, the runs
// on the app's jobs over real Postgres, whose workers poll on real timers that a recording cannot replay.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

const roles = defineRoles<'workflows' | 'workflow_versions' | 'workflow_runs'>({
  builder: ['workflows.*', 'workflow_versions.read', 'workflow_runs.*'],
  viewer: [],
})
const workflows: WorkflowsOptions = { allowPrivateAddresses: true }

type Served = Awaited<ReturnType<typeof serveMcp>>
type ToolResult = { content: Array<{ text: string }>; isError?: boolean }
type Run = { run: { status: string; error: string | null; cause: string | null; output: unknown }; steps: Array<{ state: string; status: string; input: unknown; output: unknown; error: string | null; cause: string | null; logs: unknown }> }

describe.skipIf(!(await postgresTemplateReady('auth')))('workflows over MCP', () => {
  let database: PostgresDatabase
  let pool: pg.Pool
  let served: Served
  let runtime: JobsRuntime
  let receiver: Server
  let base: string
  let folder: Awaited<ReturnType<typeof tempDir>>
  const tokens: Record<string, string> = {}

  beforeAll(async () => {
    database = await openPostgresDatabase('auth')
    await database.exec((await jobsSchemaMigration(database.db))!)
    await database.exec((await workflowsMigration(database.db, workflows))!)
    pool = database.pool({ max: 2 })
    const store = { dialect: database.dialect, query: async (text: string, params?: readonly unknown[]) => ({ rows: (await pool.query(text, params as unknown[])).rows }) }
    const { resources } = configExports(workflowsModule(workflows))
    folder = await tempDir()
    served = await serveMcp(undefined, {
      existing: store,
      db: database.db,
      workflows,
      files: { providers: { private: localFiles({ dir: folder.dir }) }, secret: 'files-secret-for-the-mcp-workflows' },
      tenant: '1',
      resources,
      auth: { roles: ['admin', 'builder', 'viewer'], defaultRole: 'viewer' },
      admin: { roles, mcp: { writes: { rolesWithoutApproval: ['builder', 'viewer'] } } },
    })
    await createUser(served.auth, { email: 'root@example.com', password })
    await createUser(served.auth, { email: 'ana@example.com', password, role: 'builder' })
    await createUser(served.auth, { email: 'bo@example.com', password, role: 'viewer' })
    for (const email of ['ana@example.com', 'bo@example.com']) tokens[email] = (await served.grant(email)).tokens.access_token
    receiver = createServer((request, response) => {
      if (request.url === '/greeting') return void response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ greeting: 'hello' }))
      response.writeHead(500, { 'content-type': 'text/plain' }).end('the notifier is down')
    })
    await new Promise<void>((resolve) => receiver.listen(0, '127.0.0.1', resolve))
    base = `http://127.0.0.1:${(receiver.address() as AddressInfo).port}`
    runtime = await startJobs({ db: database.db, jobs: served.app.jobs, pollSeconds: 0.5, shutdownSeconds: 5, onError: (error) => { throw error } })
  })

  afterAll(async () => {
    await runtime?.stop()
    await new Promise((resolve) => receiver?.close(resolve))
    await pool?.end()
    await database?.close()
    await folder?.remove()
  })

  // The JSON-RPC answer, sent as JSON or as one server-sent event.
  const rpc = async (email: string, method: string, params: object = {}) => {
    const response = await served.request('/api/mcp', {
      body: { jsonrpc: '2.0', id: 1, method, params },
      headers: { host: 'localhost:5173', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-11-25', authorization: `Bearer ${tokens[email]}` },
    })
    const text = await response.text()
    const data = text.trimStart().startsWith('{') ? text : text.split('\n').find((line) => line.startsWith('data: '))!.slice('data: '.length)
    const message = JSON.parse(data) as { result?: Record<string, unknown>; error?: unknown }
    expect(message.error).toBeUndefined()
    return message.result!
  }
  const call = async (email: string, name: string, args: object) => {
    const result = (await rpc(email, 'tools/call', { name, arguments: args })) as ToolResult
    expect(result.isError, result.content[0]!.text).toBeFalsy()
    return JSON.parse(result.content[0]!.text)
  }
  const ana = (name: string, args: object = {}) => call('ana@example.com', name, args)
  // Ended, with the trace its last segment writes in the background joined into one.
  const finished = async (runId: string): Promise<Run> => {
    let run: Run | undefined
    await vi.waitFor(async () => {
      run = await ana('get_workflow_run', { run_id: runId })
      expect(['succeeded', 'failed']).toContain(run!.run.status)
      expect((await sql<{ trace_file: string | null }>`select trace_file from workflows.runs where id = ${runId}`.execute(database.db)).rows[0]!.trace_file).not.toBeNull()
    }, { timeout: 20_000, interval: 200 })
    return (await ana('get_workflow_run', { run_id: runId })) as Run
  }
  const counts = async () => (await sql<{ workflows: number; runs: number }>`select (select count(*)::int from workflows.workflows) as workflows, (select count(*)::int from workflows.runs) as runs`.execute(database.db)).rows[0]!

  const definition = (states: Record<string, unknown>) => ({ trigger: { manual: {} }, stateMachine: { QueryLanguage: 'JSONata', StartAt: Object.keys(states)[0], States: states } })
  const fetchGreeting = (next: string) => ({ Type: 'Task', Resource: 'app:http', Arguments: { url: `{% $states.context.Execution.Input.base & '/greeting' %}` }, Assign: { greeting: '{% $states.result.body.greeting %}' }, Next: next })

  it('tells the client the language, and offers the workflow tools', async () => {
    const initialized = await rpc('ana@example.com', 'initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'client', version: '1.0.0' } })
    expect(initialized.instructions).toContain('$states.context.Execution.Input')
    const tools = ((await rpc('ana@example.com', 'tools/list')).tools as Array<{ name: string }>).map((tool) => tool.name)
    expect(tools).toEqual(expect.arrayContaining(['list_workflow_types', 'list_workflows', 'get_workflow', 'validate_workflow', 'create_workflow', 'update_workflow', 'run_workflow', 'get_workflow_run', 'enable_workflow', 'new_webhook_url']))
  })

  it('finds the types, creates a two-step workflow, runs it and reads each step', async () => {
    const types = await ana('list_workflow_types')
    expect(types.step_types.map((type: { id: string }) => type.id)).toContain('app:http')
    const http = types.step_types.find((type: { id: string }) => type.id === 'app:http')
    expect(http.input.required).toEqual(['url'])
    expect(http.input.properties.url).toEqual({ type: 'string', description: 'an http or https URL' })
    const created = await ana('create_workflow', { name: 'Greet', definition: definition({ Fetch: fetchGreeting('Shape'), Shape: { Type: 'Pass', Output: '{% { "said": $greeting } %}', End: true } }) })
    expect(created).toMatchObject({ id: expect.any(String), version: 1 })
    expect((await ana('list_workflows')).items).toEqual([expect.objectContaining({ id: created.id, name: 'Greet', version: 1 })])
    const started = await ana('run_workflow', { id: created.id, input: { base } })
    expect(started).toEqual({ run_id: expect.any(String), status: 'queued' })
    const { run, steps } = await finished(started.run_id)
    expect(run).toMatchObject({ status: 'succeeded', output: { said: 'hello' } })
    expect(steps.map(({ state, status, output }) => ({ state, status, output }))).toEqual([
      { state: 'Fetch', status: 'succeeded', output: expect.objectContaining({ status: 200, body: { greeting: 'hello' } }) },
      { state: 'Shape', status: 'succeeded', output: { said: 'hello' } },
    ])
    expect(steps[0]!.input).toEqual({ url: `${base}/greeting` })
  })

  it('reads why the second step failed, fixes that step with an edit and runs again to success', async () => {
    const notify = { Type: 'Task', Resource: 'app:http', Arguments: { method: 'POST', url: `{% $states.context.Execution.Input.base & '/notify' %}`, body: { said: '{% $greeting %}' } }, End: true }
    const { id } = await ana('create_workflow', { name: 'Notify', definition: definition({ Fetch: fetchGreeting('Notify'), Notify: notify }) })
    const failed = await finished((await ana('run_workflow', { id, input: { base } })).run_id)
    expect(failed.run).toMatchObject({ status: 'failed', error: 'Http.Status' })
    expect(failed.steps.find((step) => step.state === 'Notify')).toMatchObject({ status: 'failed', error: 'Http.Status', cause: expect.stringContaining('500: the notifier is down') })

    const edit = { stateMachine: { States: { Notify: { Arguments: { url: `{% $states.context.Execution.Input.base & '/greeting' %}` } } } } }
    expect(await ana('validate_workflow', { id, edit })).toEqual({ valid: true })
    expect(await ana('update_workflow', { id, edit })).toMatchObject({ id, version: 2 })
    const saved = (await ana('get_workflow', { id })).workflow
    expect(saved.definition.stateMachine.States.Notify).toEqual({ ...notify, Arguments: { ...notify.Arguments, url: edit.stateMachine.States.Notify.Arguments.url } })
    const fixed = await finished((await ana('run_workflow', { id, input: { base } })).run_id)
    expect(fixed.run.status).toBe('succeeded')
    expect(fixed.steps.map((step) => [step.state, step.status])).toEqual([['Fetch', 'succeeded'], ['Notify', 'succeeded']])
  })

  it('refuses an invalid definition naming the step and field, and saves nothing', async () => {
    const before = await counts()
    const broken = definition({ Fetch: { ...fetchGreeting('Gone'), Arguments: { url: '{% $nowhere %}' } } })
    const refused = await ana('create_workflow', { name: 'Broken', definition: broken })
    expect(refused).toMatchObject({ error: 'invalid-workflow' })
    expect(refused.problems).toEqual(expect.arrayContaining([
      { state: 'Fetch', field: 'Next', message: 'names "Gone", which is not a state here' },
      { state: 'Fetch', field: 'Arguments.url', message: 'reads $nowhere, which no state that can run before it assigns' },
    ]))
    expect((await ana('validate_workflow', { definition: broken })).problems).toEqual(refused.problems)
    expect(await counts()).toEqual(before)
  })

  it('creates a webhook workflow, turns it on, gets its URL, and reads the run a signed call started', async () => {
    const echo = { QueryLanguage: 'JSONata', StartAt: 'Done', States: { Done: { Type: 'Pass', Output: '{% $states.context.Execution.Input.body %}', End: true } } }
    const { id } = await ana('create_workflow', { name: 'Hook', definition: { trigger: { 'app:webhook': {} }, stateMachine: echo } })
    expect(await ana('enable_workflow', { id, enabled: true, version: 1 })).toEqual({ id, enabled_version: 1 })
    const { url, secret } = await ana('new_webhook_url', { id })
    expect(url).toMatch(/\/api\/workflows\/hooks\/[\w-]{43}$/)
    const body = '{"order":7}'
    const at = Math.floor(Date.now() / 1000)
    const signature = createHmac('sha256', Buffer.from(secret.replace(/^whsec_/, ''), 'base64')).update(`msg_1.${at}.${body}`).digest('base64')
    const response = await served.app.request(url, { method: 'POST', body, headers: { 'content-type': 'application/json', 'webhook-id': 'msg_1', 'webhook-timestamp': String(at), 'webhook-signature': `v1,${signature}` } })
    expect(response.status).toBe(202)
    const { run_id } = (await response.json()) as { run_id: string }
    const { run, steps } = await finished(run_id)
    expect(run).toMatchObject({ status: 'succeeded', output: { order: 7 } })
    expect(steps.map((step) => [step.state, step.status])).toEqual([['Done', 'succeeded']])
    expect(await ana('enable_workflow', { id, enabled: false })).toEqual({ id, enabled_version: null })
  })

  it('lets a person without the grants list, change or run no workflow', async () => {
    const { id } = await ana('create_workflow', { name: 'Private', definition: definition({ Done: { Type: 'Succeed' } }) })
    const before = await counts()
    const bo = (name: string, args: object = {}) => call('bo@example.com', name, args)
    // The resources are hidden from them, as the REST API hides them.
    const hidden = (resource: string) => ({ error: 'not-found', message: `There is no resource "${resource}"` })
    expect(await bo('list_workflows')).toEqual(hidden('workflows'))
    expect(await bo('get_workflow', { id })).toEqual(hidden('workflows'))
    expect(await bo('create_workflow', { name: 'Mine', definition: definition({ Done: { Type: 'Succeed' } }) })).toEqual(hidden('workflows'))
    expect(await bo('update_workflow', { id, name: 'Taken' })).toEqual(hidden('workflows'))
    expect(await bo('run_workflow', { id, input: {} })).toEqual(hidden('workflow_runs'))
    expect(await bo('enable_workflow', { id, enabled: true, version: 1 })).toMatchObject({ error: 'not-found' })
    expect(await bo('new_webhook_url', { id })).toMatchObject({ error: 'not-found' })
    expect(await counts()).toEqual(before)
    expect((await ana('get_workflow', { id })).workflow.name).toBe('Private')
  })
})
