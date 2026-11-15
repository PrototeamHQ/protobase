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
import { definitionFields } from '../../../test-support/workflow-fields'
import { testRunner } from '../../../tests/workflows/support/test-runner'
import { origin, password, serveMcp } from './support/mcp-app'

// An MCP client signed in as a person makes a runner, saves a custom step, waits for a runner to build it, tests it on
// an input and uses it in a workflow, the runner speaking the runners' HTTP API on the app's jobs over real Postgres,
// whose claims and workers wait on real timers that a recording cannot replay.
vi.setConfig({ testTimeout: 40_000, hookTimeout: 30_000 })

const roles = defineRoles<'workflows' | 'workflow_versions' | 'workflow_runs' | 'workflow_custom_steps' | 'workflow_custom_step_versions' | 'workflow_custom_step_builds' | 'workflow_custom_step_jobs' | 'workflow_runners'>({
  builder: ['workflows.*', 'workflow_versions.read', 'workflow_runs.*', 'workflow_custom_steps.*', 'workflow_custom_step_versions.read', 'workflow_custom_step_builds.read', 'workflow_custom_step_jobs.read', 'workflow_runners.*'],
  viewer: [],
})
const workflows: WorkflowsOptions = { customSteps: true, runners: { claimSeconds: 10, leaseSeconds: 10, coldWaitSeconds: 0, warmWaitSeconds: 0 } }

type ToolResult = { content: Array<{ text: string }>; isError?: boolean }

const shout = {
  name: 'shout',
  label: 'Shout',
  description: 'Gives its text in capitals.',
  container: { dockerfile: 'FROM alpine:3.20\nCOPY shout.sh /shout.sh', files: { 'shout.sh': '#!/bin/sh\njq \'{ text: (.text | ascii_upcase) }\' "$PROTOBASE_INPUT" > "$PROTOBASE_OUT/output.json"' }, command: ['sh', '/shout.sh'] },
  input: { type: 'object', required: ['text'], properties: { text: { type: 'string' } } },
  output: { type: 'object', required: ['text'], properties: { text: { type: 'string' } } },
  error_prefix: 'Shout',
  errors: { Silent: 'there was nothing to shout' },
}
const step = 'custom:shout:1'
const building = { platform: 'linux/amd64', kinds: ['container', 'build'], labels: [], capacity: { slots: 1 }, images: [], instances: [] }

describe.skipIf(!(await postgresTemplateReady('auth')))('custom steps over MCP', () => {
  let database: PostgresDatabase
  let pool: pg.Pool
  let served: Awaited<ReturnType<typeof serveMcp>>
  let runtime: JobsRuntime
  let folder: Awaited<ReturnType<typeof tempDir>>
  let machine: ReturnType<typeof testRunner> & { id: string }
  const tokens: Record<string, string> = {}

  beforeAll(async () => {
    database = await openPostgresDatabase('auth')
    await database.exec((await jobsSchemaMigration(database.db))!)
    await database.exec((await workflowsMigration(database.db, workflows))!)
    pool = database.pool({ max: 4 })
    const store = { dialect: database.dialect, query: async (text: string, params?: readonly unknown[]) => ({ rows: (await pool.query(text, params as unknown[])).rows }) }
    const { resources } = configExports(workflowsModule(workflows))
    folder = await tempDir()
    served = await serveMcp(undefined, {
      existing: store,
      db: database.db,
      workflows,
      files: { providers: { private: localFiles({ dir: folder.dir }) }, secret: 'files-secret-for-the-mcp-custom-steps' },
      tenant: '1',
      resources,
      auth: { roles: ['admin', 'builder', 'viewer'], defaultRole: 'viewer' },
      admin: { roles, mcp: { writes: { rolesWithoutApproval: ['builder', 'viewer'] } } },
    })
    await createUser(served.auth, { email: 'root@example.com', password })
    await createUser(served.auth, { email: 'ana@example.com', password, role: 'builder' })
    await createUser(served.auth, { email: 'bo@example.com', password, role: 'viewer' })
    for (const email of ['ana@example.com', 'bo@example.com']) tokens[email] = (await served.grant(email)).tokens.access_token
    runtime = await startJobs({ db: database.db, jobs: served.app.jobs, pollSeconds: 0.5, shutdownSeconds: 5, onError: (error) => { throw error } })
  })

  afterAll(async () => {
    await runtime?.stop()
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
  // The runner reaches the app as a machine does, on its own address.
  const fetch = (path: string, init: RequestInit) => served.app.request(`${origin}${path}`, { ...init, headers: { ...(init.headers as Record<string, string>), 'x-forwarded-for': '203.0.113.9' } })

  it('tells the client the contract of custom steps, and offers their tools', async () => {
    const initialized = await rpc('ana@example.com', 'initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'client', version: '1.0.0' } })
    expect(initialized.instructions).toContain('$PROTOBASE_OUT/output.json')
    const tools = ((await rpc('ana@example.com', 'tools/list')).tools as Array<{ name: string }>).map((tool) => tool.name)
    expect(tools).toEqual(expect.arrayContaining(['get_custom_step', 'list_runners', 'save_custom_step', 'test_custom_step', 'create_runner_token']))
  })

  it('makes a runner with its install command, which registers a machine once, offline until it claims', async () => {
    const made = await ana('create_runner_token', { name: 'Video box', labels: ['gpu'] })
    expect(made).toMatchObject({ id: expect.any(String), name: 'Video box', labels: ['gpu'], endpoint: `${origin}/api/runners/v1`, expires_at: expect.any(String) })
    expect(made.command).toMatch(new RegExp(`^curl -fsSL ${origin}/api/runners/install\\.sh \\| sh -s -- --token pbr_once_[A-Za-z0-9_-]{43}$`))
    const token = /--token (\S+)$/.exec(made.command)![1]!
    machine = Object.assign(testRunner(fetch), { id: String(made.id) })
    expect((await machine.register(token)).status).toBe(200)
    expect((await machine.register(token)).status).toBe(409)
    expect((await ana('list_runners')).runners).toEqual([expect.objectContaining({ id: made.id, name: 'Video box', online: false, registered: true, revoked: false, labels: ['gpu'], platform: 'linux/amd64' })])
  })

  it('saves a custom step, which the runner that builds is sent to build, and the save waits for it to be ready', async () => {
    expect(await ana('save_custom_step', { ...shout, wait_seconds: 0 })).toMatchObject({ name: 'shout', version: 1, build: { status: 'no_runner' } })
    // A version that does not change saves no new one; the claim of a runner that builds is answered to build it
    const claimed = machine.raw('/claim', building).then((response) => response.json() as Promise<Record<string, unknown>>)
    const { id } = await ana('get_custom_step', { name: 'shout' })
    const saving = ana('save_custom_step', { id, label: 'Shout', wait_seconds: 30 })
    expect(await claimed).toEqual({ order: 'prepare', step, build: { dockerfile: shout.container.dockerfile, files: shout.container.files, command: shout.container.command } })
    expect((await machine.raw('/builds', { step, status: 'building' })).status).toBe(200)
    expect((await machine.raw('/builds', { step, status: 'ready', digest: 'sha256:5a1e', log: '#1 FROM alpine:3.20\n#2 COPY shout.sh\nwriting image sha256:5a1e' })).status).toBe(200)
    expect(await saving).toEqual({ id, name: 'shout', version: 1, build: { runner: machine.id, status: 'ready', digest: 'sha256:5a1e', seconds: expect.any(Number), log_tail: '#1 FROM alpine:3.20\n#2 COPY shout.sh\nwriting image sha256:5a1e' } })
    const read = await ana('get_custom_step', { name: 'shout' })
    expect(read).toMatchObject({ id, name: 'shout', version: 1, etag: expect.any(String), step: { label: 'Shout', container: shout.container } })
    expect(read.versions).toEqual([expect.objectContaining({ version: 1, type: step, builds: [expect.objectContaining({ runner: machine.id, status: 'ready', digest: 'sha256:5a1e' })] })])
    const types = await ana('list_workflow_types')
    expect(types.step_types.find((type: { id: string }) => type.id === step)).toMatchObject({ label: 'Shout', build: 'ready', errors: { 'Shout.Silent': 'there was nothing to shout' } })
  })

  it('answers a manifest the check refuses with its problems, and saves nothing', async () => {
    const refused = await ana('save_custom_step', { ...shout, name: 'broken', container: { dockerfile: 'RUN true', files: {} } })
    expect(refused).toEqual({ error: 'invalid-custom-step', message: expect.stringContaining('nothing was saved'), problems: [{ field: 'container.dockerfile', message: expect.stringContaining('no FROM instruction') }] })
    expect((await sql`select 1 from workflows.custom_steps where name = 'broken'`.execute(database.db)).rows).toEqual([])
  })

  it('tests a version on an input without a workflow, a runner running its job, and gives its output, log and failure', async () => {
    const holding = { ...building, images: [{ step }] }
    const claimed = machine.claimJob(holding)
    const testing = ana('test_custom_step', { name: 'shout', version: 1, input: { text: 'hello' }, wait_seconds: 30 })
    const job = await claimed
    expect(job).toMatchObject({ step, input: { text: 'hello' }, files: [], output_files: [] })
    // Online while it runs the job, with what it said with its claim
    expect((await ana('list_runners')).runners).toEqual([expect.objectContaining({ id: machine.id, online: true, kinds: ['container', 'build'], free_slots: 1, images: [step] })])
    await machine.log(job.id, ['shouting hello'])
    expect((await machine.complete(job.id, { output: { text: 'HELLO' } })).status).toBe(200)
    const tested = await testing
    expect(tested).toEqual({ run_id: expect.any(String), job_id: job.id, status: 'succeeded', output: { text: 'HELLO' }, log_tail: 'shouting hello', seconds: expect.any(Number) })
    // A run of no workflow, which reads as the person's own
    expect((await sql<{ workflow_id: string | null; test_step: string }>`select workflow_id, test_step from workflows.runs where id = ${tested.run_id}`.execute(database.db)).rows).toEqual([{ workflow_id: null, test_step: step }])
    await vi.waitFor(async () => expect((await ana('get_workflow_run', { run_id: tested.run_id })).run).toMatchObject({ status: 'succeeded', output: { text: 'HELLO' }, workflow_id: null, test_step: step }), { timeout: 10_000, interval: 200 })
    // It reads as a record of workflow_runs, naming the version it tested; no write sets test_step, so a run the API
    // starts always names its workflow
    expect((await ana('get_record', { resource: 'workflow_runs', key: tested.run_id })).record).toMatchObject({ workflow_id: null, test_step: step, status: 'succeeded' })
    expect(await ana('create_record', { resource: 'workflow_runs', data: { test_step: step, input: { text: 'x' } } })).toMatchObject({ message: expect.stringContaining('test_step') })
    // No workflow's status counts it
    expect((await sql<{ count: number }>`select count(*)::int as count from workflows.workflows where status_run_id = ${tested.run_id}`.execute(database.db)).rows[0]!.count).toBe(0)

    const failing = machine.claimJob(holding)
    const again = ana('test_custom_step', { name: 'shout', version: 1, input: { text: '' }, wait_seconds: 30 })
    const second = await failing
    expect((await machine.complete(second.id, { error: 'Silent', cause: 'the text is empty' })).status).toBe(200)
    expect(await again).toMatchObject({ job_id: second.id, status: 'failed', error: 'Shout.Silent', cause: 'the text is empty', log_tail: '' })
  })

  it('uses the tested version in a workflow, which runs it on the runner', async () => {
    const machineDefinition = { trigger: { manual: {} }, stateMachine: { QueryLanguage: 'JSONata', StartAt: 'Shout', States: { Shout: { Type: 'Task', Resource: step, Arguments: { text: '{% $states.context.Execution.Input.text %}' }, End: true } } } }
    expect(await ana('validate_workflow', definitionFields(machineDefinition))).toEqual({ valid: true })
    const created = await ana('create_workflow', { name: 'Shout it', ...definitionFields(machineDefinition) })
    const claimed = machine.claimJob({ ...building, images: [{ step }] })
    const started = await ana('run_workflow', { id: created.id, input: { text: 'hi' } })
    const job = await claimed
    expect((await machine.complete(job.id, { output: { text: 'HI' } })).status).toBe(200)
    await vi.waitFor(async () => expect((await ana('get_workflow_run', { run_id: started.run_id })).run).toMatchObject({ status: 'succeeded', output: { text: 'HI' } }), { timeout: 15_000, interval: 200 })
  })

  it('lets a person without the grants save, test, read or make no custom step or runner', async () => {
    const bo = (name: string, args: object = {}) => call('bo@example.com', name, args)
    const before = (await sql<{ count: number }>`select (select count(*)::int from workflows.runs) + (select count(*)::int from workflows.runners) + (select count(*)::int from workflows.custom_steps) as count`.execute(database.db)).rows[0]!
    expect(await bo('save_custom_step', { ...shout, name: 'mine' })).toMatchObject({ error: 'not-found' })
    expect(await bo('get_custom_step', { name: 'shout' })).toMatchObject({ error: 'not-found' })
    expect(await bo('test_custom_step', { name: 'shout', version: 1, input: { text: 'x' } })).toMatchObject({ error: 'not-found' })
    expect(await bo('list_runners')).toMatchObject({ error: 'not-found' })
    // Checked before anything is made: issuing its token needs update access, which bo has not
    expect(await bo('create_runner_token', { name: 'Mine' })).toMatchObject({ error: 'forbidden' })
    expect((await sql<{ count: number }>`select (select count(*)::int from workflows.runs) + (select count(*)::int from workflows.runners) + (select count(*)::int from workflows.custom_steps) as count`.execute(database.db)).rows[0]).toEqual(before)
  })
})
