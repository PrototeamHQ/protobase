import { readFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { sql, type Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { defineRoles } from '@protobase/schema'
import { configExports, createAdmin, startJobs, startWorkflow, workflowsMigration, type JobsRuntime, type WorkflowsOptions } from '@protobase/server'
import { localFiles, workflowsModule } from '@protobase/server/internal'
import { tempDir } from '../../packages/server/src/files/testing/temp-dir'
import { postgresRunStore } from '../../packages/server/src/workflows/store'
import { openPostgresDatabase, postgresTemplateReady, type PostgresDatabase } from '../../test-support/postgres-database'

// Workers poll and retry on real timers, which a busy machine stretches.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

const roles = defineRoles<'workflows' | 'workflow_versions' | 'workflow_runs'>({
  admin: ['*'],
  builder: ['workflows.*', 'workflow_versions.read', 'workflow_runs.*'],
  viewer: ['*.read'],
})
const people: Record<string, string[]> = { ada: ['builder'], vic: ['viewer'] }
const workflows: WorkflowsOptions = { savedByRoles: async ({ id }) => people[id] ?? [] }

const definition = (states: Record<string, unknown>) => ({ trigger: { manual: {} }, stateMachine: { QueryLanguage: 'JSONata', StartAt: Object.keys(states)[0], States: states } })

describe.skipIf(!(await postgresTemplateReady('jobs')))('workflows on the app\'s database and jobs', () => {
  let pg: PostgresDatabase
  let db: Kysely<any>
  let admin: ReturnType<typeof createAdmin>
  let runtime: JobsRuntime | undefined
  let receiver: Server
  let folder: Awaited<ReturnType<typeof tempDir>>
  const received: string[] = []
  const errors: unknown[] = []

  const start = async () => {
    runtime = await startJobs({ db, jobs: admin.jobs, pollSeconds: 0.5, shutdownSeconds: 5, onError: (error) => errors.push(error) })
  }

  beforeAll(async () => {
    pg = await openPostgresDatabase('jobs')
    db = pg.db
    await pg.exec((await workflowsMigration(db, workflows))!)
    const { resources, views } = configExports(workflowsModule(workflows))
    folder = await tempDir()
    const files = { providers: { private: localFiles({ dir: folder.dir }) }, secret: 'files-secret-for-the-engine-tests' }
    admin = createAdmin({ resources, views, db, files, authenticate: (request) => ({ user: { id: request.headers.get('x-user')!, roles: people[request.headers.get('x-user')!]! }, tenant: '1' }), workflows, options: { roles } })
    receiver = createServer((request, response) => {
      received.push(request.url ?? '')
      response.end('{}')
    })
    await new Promise<void>((resolve) => receiver.listen(0, '127.0.0.1', resolve))
    await start()
  })

  afterAll(async () => {
    await runtime?.stop()
    await new Promise((resolve) => receiver?.close(resolve))
    await pg?.close()
    await folder?.remove()
    expect(errors).toEqual([])
  })

  const as = (user: string, path: string, init: { method?: string; body?: unknown } = {}) =>
    admin.request(`/api/v1${path}`, { method: init.method ?? 'GET', headers: { 'content-type': 'application/json', 'x-user': user, 'if-match': '*' }, ...(init.body !== undefined && { body: JSON.stringify(init.body) }) })
  const create = async (name: string, value: unknown) => {
    const response = await as('ada', '/workflows', { method: 'POST', body: { name, definition: value } })
    if (response.status !== 201) throw new Error(await response.text())
    return (await response.json()).id as string
  }
  const run = async (workflow: string, input: unknown) => {
    const response = await as('ada', '/workflow_runs', { method: 'POST', body: { workflow_id: workflow, input } })
    expect(response.status).toBe(201)
    return (await response.json()).id as string
  }
  const runRow = async (id: string) => (await sql<{ status: string; output: unknown; error: string | null; cause: string | null; version: number; started_by: string }>`select status, output, error, cause, version, started_by from workflows.runs where id = ${id}`.execute(db)).rows[0]!
  const finished = (id: string, timeout = 20_000) => vi.waitFor(async () => expect(['succeeded', 'failed']).toContain((await runRow(id)).status), { timeout, interval: 50 })
  // The run's trace, which the run's last segment writes in the background once the run ended.
  const steps = async (id: string) => {
    await vi.waitFor(async () => expect((await sql<{ trace_file: string | null }>`select trace_file from workflows.runs where id = ${id}`.execute(db)).rows[0]!.trace_file).toMatch(/^private:workflows\//), { timeout: 10_000, interval: 50 })
    const text = await readFile(`${folder.dir}/workflows/${id}/trace.jsonl`, 'utf8')
    return text.split('\n').filter(Boolean).map((line) => JSON.parse(line) as Record<string, unknown>)
  }
  const checkpoints = async (id: string) => (await sql<{ count: number }>`select count(*)::int as count from workflows.checkpoints where run_id = ${id}`.execute(db)).rows[0]!.count

  it('refuses a definition with a missing input or an edge to no step, naming the step and the field', async () => {
    const response = await as('ada', '/workflows', {
      method: 'POST',
      body: { name: 'Broken', definition: definition({ Call: { Type: 'Task', Resource: 'app:http', Arguments: { url: '{% $address %}' }, Next: 'Nowhere' }, Done: { Type: 'Succeed' } }) },
    })
    expect(response.status).toBe(400)
    const problem = await response.json()
    expect(problem.problems).toEqual([
      { state: 'Call', field: 'Next', message: 'names "Nowhere", which is not a state here' },
      { state: 'Call', field: 'Arguments.url', message: 'reads $address, which no state that can run before it assigns' },
      { state: 'Done', message: 'is never reached from "Call"' },
    ])
    expect(problem.detail).toContain('State "Call", field "Next": names "Nowhere", which is not a state here')
    expect(problem.errors[0]).toEqual({ code: 'invalid-workflow', field: 'definition', message: 'State "Call", field "Next": names "Nowhere", which is not a state here', params: { state: 'Call', field: 'Next' } })
    expect((await sql<{ count: number }>`select count(*)::int as count from workflows.workflows`.execute(db)).rows[0]!.count).toBe(0)
  })

  it('refuses a step without an argument its step type needs', async () => {
    const response = await as('ada', '/workflows', { method: 'POST', body: { name: 'No address', definition: definition({ Call: { Type: 'Task', Resource: 'app:http', Arguments: { method: 'GET' }, End: true } }) } })
    expect(response.status).toBe(400)
    expect((await response.json()).problems).toEqual([{ state: 'Call', field: 'Arguments.url', message: 'is missing; app:http needs it' }])
  })

  it('keeps each saved definition as a version, and a run keeps the version it started on', async () => {
    const id = await create('Echo', definition({ Echo: { Type: 'Pass', Output: '{% $states.context.Execution.Input.word %}', End: true } }))
    const first = await run(id, { word: 'one' })
    const changed = await as('ada', `/workflows/${id}`, { method: 'PATCH', body: { definition: definition({ Echo: { Type: 'Pass', Output: '{% $uppercase($states.context.Execution.Input.word) %}', End: true } }) } })
    expect(changed.status).toBe(200)
    const second = await run(id, { word: 'two' })
    await finished(first)
    await finished(second)
    expect(await runRow(first)).toMatchObject({ status: 'succeeded', output: 'one', version: 1, started_by: 'ada' })
    expect(await runRow(second)).toMatchObject({ status: 'succeeded', output: 'TWO', version: 2 })
    const { items } = await (await as('ada', `/workflow_versions?filter=${encodeURIComponent(`workflow_id = "${id}"`)}`)).json()
    expect(items.map((item: { version: number; saved_by: string }) => [item.version, item.saved_by])).toEqual([[1, 'ada'], [2, 'ada']])
  })

  it('writes the schema again when one of its triggers is gone, though its functions are current', async () => {
    expect(await workflowsMigration(db, workflows)).toBeUndefined()
    await pg.exec('drop trigger "run_version" on workflows.runs')
    const repair = await workflowsMigration(db, workflows)
    expect(repair).toContain('create trigger "run_version"')
    await pg.exec(repair!)
    expect(await workflowsMigration(db, workflows)).toBeUndefined()
  })

  it('adds the triggers table and enabled_version to a schema of the version before them', async () => {
    await pg.exec(`drop table workflows.triggers; alter table workflows.workflows drop column enabled_version;
      comment on function workflows.run_version() is 'Protobase workflows 4'`)
    const upgrade = await workflowsMigration(db, workflows)
    expect(upgrade).toContain('create table if not exists "workflows"."triggers"')
    await pg.exec(upgrade!)
    expect(await workflowsMigration(db, workflows)).toBeUndefined()
  })

  it('adds connection_revocations to a schema of the version before it', async () => {
    await pg.exec(`drop table workflows.connection_revocations; comment on function workflows.run_version() is 'Protobase workflows 9'`)
    const upgrade = await workflowsMigration(db, workflows)
    expect(upgrade).toContain('create table if not exists "workflows"."connection_revocations"')
    await pg.exec(upgrade!)
    expect(await workflowsMigration(db, workflows)).toBeUndefined()
  })

  it('adds the storage configurations table once storage is turned on, and not before', async () => {
    const { rows } = await sql<{ found: boolean }>`select to_regclass('workflows.storage_configurations') is not null as found`.execute(db)
    expect(rows[0]!.found).toBe(false)
    const withStorage = { ...workflows, storage: {} }
    const upgrade = await workflowsMigration(db, withStorage)
    expect(upgrade).toContain('create table if not exists "workflows"."storage_configurations"')
    await pg.exec(upgrade!)
    expect(await workflowsMigration(db, withStorage)).toBeUndefined()
  })

  it('keeps a save out of what is published: a start runs the published version unless it names one, and refuses a version never saved', async () => {
    const id = await create('Echo', definition({ Echo: { Type: 'Pass', Output: 'one', End: true } }))
    expect((await as('ada', `/workflows/${id}`, { method: 'PATCH', body: { enabled_version: 1 } })).status).toBe(200)
    const saved = await as('ada', `/workflows/${id}`, { method: 'PATCH', body: { definition: definition({ Echo: { Type: 'Pass', Output: 'two', End: true } }) } })
    expect(await saved.json()).toMatchObject({ version: 2, enabled_version: 1 })
    const published = await run(id, {})
    const test = await as('ada', '/workflow_runs', { method: 'POST', body: { workflow_id: id, input: {}, version: 2 } })
    const tried = (await test.json()).id as string
    await finished(published)
    await finished(tried)
    expect(await runRow(published)).toMatchObject({ output: 'one', version: 1 })
    expect(await runRow(tried)).toMatchObject({ output: 'two', version: 2 })
    expect((await as('ada', '/workflow_runs', { method: 'POST', body: { workflow_id: id, input: {}, version: 9 } })).status).toBe(409)
    expect((await as('ada', `/workflows/${id}`, { method: 'PATCH', body: { enabled_version: 9 } })).status).toBe(400)
    // A publish alone is a change of the record: an ETag read before it is stale
    const read = (await as('ada', `/workflows/${id}`)).headers.get('etag')!
    expect((await as('ada', `/workflows/${id}`, { method: 'PATCH', body: { enabled_version: 2 } })).status).toBe(200)
    const stale = await admin.request(`/api/v1/workflows/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json', 'x-user': 'ada', 'if-match': read }, body: JSON.stringify({ enabled_version: 1 }) })
    expect(stale.status).toBe(412)
    // Two writes of one batch are two ETags too
    const batch = await admin.request('/api/v1:batchWrite', { method: 'POST', headers: { 'content-type': 'application/json', 'x-user': 'ada' }, body: JSON.stringify({ ops: ['one', 'two'].map((name) => ({ op: 'update', resource: 'workflows', key: id, data: { description: name }, etag: '*' })) }) })
    expect(batch.status).toBe(200)
    const [first, second] = (await batch.json()).results as { etag: string }[]
    expect(first!.etag).not.toBe(second!.etag)
    const made = await admin.request('/api/v1:batchWrite', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user': 'ada' },
      body: JSON.stringify({ ops: [{ op: 'create', resource: 'workflows', ref: 'new', data: { name: 'Made', definition: definition({ Echo: { Type: 'Pass', Output: 'one', End: true } }) } }, { op: 'update', resource: 'workflows', key: { $ref: 'new' }, etag: '*', data: { enabled_version: 1 } }] }),
    })
    expect(made.status).toBe(200)
    const [created, live] = (await made.json()).results as { etag: string }[]
    expect(created!.etag).not.toBe(live!.etag)
    expect((await as('ada', `/workflows/${id}`, { method: 'PATCH', body: { enabled_version: null } })).status).toBe(200)
    const off = await run(id, {})
    await finished(off)
    expect(await runRow(off)).toMatchObject({ output: 'two', version: 2 })
  })

  it('refuses a run of a version with no steps, on the version a replay takes too', async () => {
    const id = await create('Echo', definition({ Echo: { Type: 'Pass', Output: 'one', End: true } }))
    expect((await as('ada', `/workflows/${id}`, { method: 'PATCH', body: { enabled_version: 1 } })).status).toBe(200)
    const first = await run(id, {})
    await finished(first)
    const emptied = { trigger: { manual: {} }, stateMachine: { QueryLanguage: 'JSONata', StartAt: '', States: {} } }
    expect((await as('ada', `/workflows/${id}`, { method: 'PATCH', body: { definition: emptied } })).status).toBe(200)
    // A start without a version runs the published one, which has steps; a replay takes the empty one saved last
    const started = await run(id, {})
    await finished(started)
    const replay = await as('ada', '/workflow_runs', { method: 'POST', body: { workflow_id: id, rerun_of: first, replay: true } })
    expect(replay.status).toBe(409)
    const { items } = await (await as('ada', `/workflow_runs?filter=${encodeURIComponent(`workflow_id = "${id}"`)}`)).json()
    expect(items).toHaveLength(2)
  })

  it('writes the run trigger again on a schema of the version whose replays ran their run\'s version', async () => {
    await pg.exec(`comment on function workflows.run_version() is 'Protobase workflows 13'`)
    const upgrade = await workflowsMigration(db, workflows)
    expect(upgrade).toContain('create or replace function "workflows"."run_version"()')
    await pg.exec(upgrade!)
    expect(await workflowsMigration(db, workflows)).toBeUndefined()
  })

  it('writes the schema again when the triggers table is gone', async () => {
    await pg.exec('drop table workflows.triggers')
    const repair = await workflowsMigration(db, workflows)
    expect(repair).toContain('create table if not exists "workflows"."triggers"')
    await pg.exec(repair!)
    expect(await workflowsMigration(db, workflows)).toBeUndefined()
  })

  it('answers a save with the row as saved, whose ETag the next save can send, and numbers no version for other fields', async () => {
    const id = await create('Tagged', definition({ Echo: { Type: 'Pass', End: true } }))
    const save = (body: unknown, etag: string) =>
      admin.request(`/api/v1/workflows/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json', 'x-user': 'ada', 'if-match': etag }, body: JSON.stringify(body) })
    const read = await as('ada', `/workflows/${id}`)
    const changed = await save({ definition: definition({ Echo: { Type: 'Pass', Output: 1, End: true } }) }, read.headers.get('etag')!)
    expect(changed.status).toBe(200)
    expect(await changed.json()).toMatchObject({ version: 2 })
    expect(changed.headers.get('etag')).toBe((await as('ada', `/workflows/${id}`)).headers.get('etag'))
    const renamed = await save({ name: 'Renamed' }, changed.headers.get('etag')!)
    expect(renamed.status).toBe(200)
    expect(await renamed.json()).toMatchObject({ name: 'Renamed', version: 2 })
  })

  it('runs a branch and a step per item, keeping each step with its input, output, logs and timing in the trace and none in the database', async () => {
    const id = await create('Prices', definition({
      Check: { Type: 'Choice', Choices: [{ Condition: '{% $count($states.context.Execution.Input.prices) > 0 %}', Next: 'Each' }], Default: 'Empty' },
      Each: { Type: 'Map', Items: '{% $states.context.Execution.Input.prices %}', ItemProcessor: { StartAt: 'Tax', States: { Tax: { Type: 'Pass', Output: '{% $states.input * 1.25 %}', End: true } } }, Assign: { taxed: '{% $states.result %}' }, Next: 'Total' },
      Total: { Type: 'Succeed', Output: '{% $sum($taxed) %}' },
      Empty: { Type: 'Succeed', Output: 0 },
    }))
    const runId = await run(id, { prices: [4, 8] })
    await finished(runId)
    expect(await runRow(runId)).toMatchObject({ status: 'succeeded', output: 15 })
    // The items run side by side, so their rows land in either order.
    const [first, ...rest] = await steps(runId)
    const saved = [first!, ...rest.slice(0, 2).sort((a, b) => String(a.scope).localeCompare(String(b.scope))), ...rest.slice(2)]
    expect(saved.map(({ scope, seq, state, status, input, output }) => ({ scope, seq, state, status, input, output }))).toEqual([
      { scope: '', seq: 0, state: 'Check', status: 'succeeded', input: { prices: [4, 8] }, output: { prices: [4, 8] } },
      { scope: 'Each.1[0]', seq: 0, state: 'Tax', status: 'succeeded', input: 4, output: 5 },
      { scope: 'Each.1[1]', seq: 0, state: 'Tax', status: 'succeeded', input: 8, output: 10 },
      { scope: '', seq: 1, state: 'Each', status: 'succeeded', input: { items: 2 }, output: [5, 10] },
      { scope: '', seq: 2, state: 'Total', status: 'succeeded', input: [5, 10], output: 15 },
    ])
    expect(saved[0]!.logs).toEqual([{ at: expect.any(String), message: 'Choice 1 holds' }])
    expect(saved[3]!.logs).toEqual([{ at: expect.any(String), message: '2 items' }])
    for (const step of saved) expect(Date.parse(String(step.finishedAt))).toBeGreaterThanOrEqual(Date.parse(String(step.startedAt)))
    expect(await checkpoints(runId)).toBe(0)
  })

  it('retries a failing step as set, then records its error and takes its error path', async () => {
    const id = await create('Retry', definition({
      Call: {
        Type: 'Task',
        Resource: 'app:http',
        Arguments: { url: '{% $states.context.Execution.Input.url %}' },
        Retry: [{ ErrorEquals: ['Http.InvalidArguments'], IntervalSeconds: 1, MaxAttempts: 2, BackoffRate: 1 }],
        Catch: [{ ErrorEquals: ['States.ALL'], Assign: { failure: '{% $states.errorOutput.Error %}' }, Next: 'Handled' }],
        End: true,
      },
      Handled: { Type: 'Succeed', Output: '{% {"handled": $failure} %}' },
    }))
    const runId = await run(id, { url: 'not a url' })
    await finished(runId)
    expect(await runRow(runId)).toMatchObject({ status: 'succeeded', output: { handled: 'Http.InvalidArguments' } })
    expect((await steps(runId)).map(({ state, status, attempt, error }) => [state, status, attempt, error ?? null])).toEqual([
      ['Call', 'retrying', 1, 'Http.InvalidArguments'],
      ['Call', 'retrying', 2, 'Http.InvalidArguments'],
      ['Call', 'caught', 3, 'Http.InvalidArguments'],
      ['Handled', 'succeeded', 1, null],
    ])
  })

  it('fails an http step whose URL an expression builds to a private address with the guard\'s error, reaching nothing there', async () => {
    const { port } = receiver.address() as AddressInfo
    const id = await create('Private', definition({ Call: { Type: 'Task', Resource: 'app:http', Arguments: { url: '{% "http://" & $states.context.Execution.Input.host & ":" & $string($states.context.Execution.Input.port) & "/inside" %}' }, End: true } }))
    const runId = await run(id, { host: 'localhost', port })
    await finished(runId)
    expect(await runRow(runId)).toMatchObject({ status: 'failed', error: 'Http.AddressRefused', cause: expect.stringMatching(/^localhost is a private address \(.+\); requests reach public addresses only$/) })
    expect(received).toEqual([])
  })

  it('finishes a run interrupted by a restart once the server is back, without running a finished step again', async () => {
    const id = await create('Pause', definition({
      Before: { Type: 'Pass', Assign: { at: '{% $millis() %}' }, Next: 'Hold' },
      Hold: { Type: 'Wait', Seconds: 2, Next: 'After' },
      After: { Type: 'Succeed', Output: '{% $at %}' },
    }))
    const runId = await run(id, {})
    await vi.waitFor(async () => expect((await runRow(runId)).status).toBe('waiting'), { timeout: 10_000, interval: 50 })
    await runtime!.stop()
    await new Promise((resolve) => setTimeout(resolve, 2500))
    expect((await runRow(runId)).status).toBe('waiting')
    await start()
    await finished(runId)
    const saved = await steps(runId)
    expect(saved.map((step) => step.state)).toEqual(['Before', 'Hold', 'After'])
    expect((await runRow(runId)).status).toBe('succeeded')
    expect(await checkpoints(runId)).toBe(0)
  })

  it('re-runs a failed run from its failed step on the fixed workflow, on its input, keeping the steps before it', async () => {
    const states = (total: string) => ({ Count: { Type: 'Pass', Assign: { size: '{% $count($states.context.Execution.Input.items) %}' }, Next: 'Total' }, Total: { Type: 'Pass', Output: total, End: true } })
    const id = await create('Totals', definition(states("{% $error('not yet') %}")))
    const failed = await run(id, { items: [1, 2, 3] })
    await finished(failed)
    expect(await runRow(failed)).toMatchObject({ status: 'failed', error: 'States.QueryEvaluationError' })
    const refused = await as('ada', '/workflow_runs', { method: 'POST', body: { workflow_id: id, rerun_of: failed, input: { items: [] } } })
    expect(refused.status).toBe(400)
    expect((await as('ada', `/workflows/${id}`, { method: 'PATCH', body: { definition: definition(states('{% $size %}')) } })).status).toBe(200)
    const response = await as('ada', '/workflow_runs', { method: 'POST', body: { workflow_id: id, rerun_of: failed } })
    expect(response.status).toBe(201)
    const rerun = (await response.json()).id as string
    await finished(rerun)
    expect(await runRow(rerun)).toMatchObject({ status: 'succeeded', output: 3, version: 2 })
    const [before, after] = [await steps(failed), await steps(rerun)]
    expect(after.map((step) => [step.state, step.status])).toEqual([['Count', 'succeeded'], ['Total', 'succeeded']])
    expect(after[0]!.started_at).toEqual(before[0]!.started_at)
    const again = await as('ada', '/workflow_runs', { method: 'POST', body: { workflow_id: id, rerun_of: rerun } })
    expect(again.status).toBe(400)
    expect((await again.json()).type).toContain('run-not-failed')
  })

  it('re-runs an ended run from a state, from the steps its trace kept, and refuses a run that kept no trace', async () => {
    const states = (total: string) => ({ Count: { Type: 'Pass', Assign: { size: '{% $count($states.context.Execution.Input.items) %}' }, Next: 'Total' }, Total: { Type: 'Pass', Output: total, End: true } })
    const id = await create('Recount', definition(states('{% 0 %}')))
    const done = await run(id, { items: [1, 2, 3] })
    await finished(done)
    expect((await as('ada', `/workflows/${id}`, { method: 'PATCH', body: { definition: definition(states('{% $size %}')) } })).status).toBe(200)
    const response = await as('ada', '/workflow_runs', { method: 'POST', body: { workflow_id: id, rerun_of: done, rerun_from: 'Total' } })
    expect(response.status).toBe(201)
    const rerun = (await response.json()).id as string
    await finished(rerun)
    expect(await runRow(rerun)).toMatchObject({ status: 'succeeded', output: 3, version: 2 })
    const [before, after] = [await steps(done), await steps(rerun)]
    expect(after.map((step) => step.state)).toEqual(['Count', 'Total'])
    expect(after[0]!.startedAt).toEqual(before[0]!.startedAt)

    const untraced = await as('ada', '/workflow_runs', { method: 'POST', body: { workflow_id: id, input: { items: [] }, trace: 'none' } })
    const quiet = (await untraced.json()).id as string
    await finished(quiet)
    const refused = await as('ada', '/workflow_runs', { method: 'POST', body: { workflow_id: id, rerun_of: quiet, rerun_from: 'Total' } })
    expect(refused.status).toBe(400)
    expect((await refused.json()).type).toContain('rerun-no-trace')
  })

  it('starts a run from the app\'s own code inside the caller\'s transaction, or not at all when it rolls back', async () => {
    const id = await create('Inside', definition({ Done: { Type: 'Succeed', Output: '{% $states.context.Execution.Input %}' } }))
    await expect(db.transaction().execute(async (trx) => {
      await startWorkflow(trx, { workflow: id, input: 'dropped', tenant: '1' })
      throw new Error('roll back')
    })).rejects.toThrow('roll back')
    const runId = await db.transaction().execute((trx) => startWorkflow(trx, { workflow: id, input: 'kept', tenant: '1', startedBy: 'job:import' }))
    await finished(runId)
    expect(await runRow(runId)).toMatchObject({ status: 'succeeded', output: 'kept', started_by: 'job:import' })
    expect((await sql<{ count: number }>`select count(*)::int as count from workflows.runs where input = '"dropped"'`.execute(db)).rows[0]!.count).toBe(0)
  })

  it('keeps none of a save refused for one of its scopes, also inside a transaction, so another segment goes on', async () => {
    const id = await create('Saves', definition({ Done: { Type: 'Succeed' } }))
    const runId = (await sql<{ id: string }>`insert into workflows.runs (workflow_id, tenant_id, version, status) values (${id}, '1', 1, 'waiting') returning id`.execute(db)).rows[0]!.id
    const store = postgresRunStore('workflows')
    const at = (scope: string, seq: number, after: number) => ({ scope, seq, after, state: 'Done', type: 'Pass', status: 'succeeded' as const, fetchedAt: new Date(), next: 'Done', variables: {}, attempt: 1, failures: [], visits: {}, clock: new Date() })
    const scopes = async () => (await sql<{ scope: string; seq: number }>`select scope, seq from workflows.checkpoints where run_id = ${runId} order by scope`.execute(db)).rows
    expect(await store.save(db, runId, [at('x', 0, -1)])).toBe(true)
    // x has a newer checkpoint than the one this save follows, so y is not kept either.
    expect(await store.save(db, runId, [at('x', 0, -1), at('y', 0, -1)])).toBe(false)
    expect(await scopes()).toEqual([{ scope: 'x', seq: 0 }])
    await db.transaction().execute(async (trx) => {
      expect(await store.save(trx, runId, [at('y', 0, -1), at('x', 1, -1)])).toBe(false)
      expect(await store.save(trx, runId, [at('x', 1, 0)])).toBe(true)
    })
    expect(await scopes()).toEqual([{ scope: 'x', seq: 1 }])
  })

  it('starts a run once per key, however many starts race for it', async () => {
    const id = await create('Keyed', definition({ Done: { Type: 'Succeed', Output: '{% $states.context.Execution.Input %}' } }))
    const starts = await Promise.all([1, 2, 3].map((attempt) => db.transaction().execute((trx) => startWorkflow(trx, { workflow: id, input: attempt, tenant: '1', key: 'orders:42' }))))
    expect(new Set(starts).size).toBe(1)
    await finished(starts[0]!)
    expect((await sql<{ count: number }>`select count(*)::int as count from workflows.runs where workflow_id = ${id}`.execute(db)).rows[0]!.count).toBe(1)
  })

  it('lets only a role granted the workflow resources by name create, change and run workflows or read their runs', async () => {
    const id = await create('Granted', definition({ Done: { Type: 'Succeed' } }))
    const runId = await run(id, {})
    await finished(runId)
    // A resource the role cannot read answers as one that is not there.
    expect([403, 404]).toContain((await as('vic', '/workflows', { method: 'POST', body: { name: 'Mine', definition: definition({ Done: { Type: 'Succeed' } }) } })).status)
    expect((await as('vic', `/workflows/${id}`, { method: 'PATCH', body: { name: 'Renamed' } })).status).toBe(404)
    expect([403, 404]).toContain((await as('vic', '/workflow_runs', { method: 'POST', body: { workflow_id: id, input: {} } })).status)
    expect((await sql<{ count: number }>`select count(*)::int as count from workflows.runs where workflow_id = ${id}`.execute(db)).rows[0]!.count).toBe(1)
    expect((await sql<{ name: string }>`select name from workflows.workflows where id = ${id}`.execute(db)).rows[0]!.name).toBe('Granted')
    for (const path of ['/workflows', '/workflow_runs', `/workflow_runs/${runId}`]) expect([403, 404]).toContain((await as('vic', path)).status)
    expect((await as('ada', `/workflow_runs/${runId}`)).status).toBe(200)
  })
})
