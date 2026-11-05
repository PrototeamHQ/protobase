import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { sql, type Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { defineRoles } from '@protobase/schema'
import { configExports, createAdmin, startJobs, startWorkflow, workflowsMigration, type JobsRuntime, type WorkflowsOptions } from '@protobase/server'
import { workflowsModule } from '@protobase/server/internal'
import { openPostgresDatabase, postgresTemplateReady, type PostgresDatabase } from '../../test-support/postgres-database'

// Workers poll and retry on real timers, which a busy machine stretches.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

const roles = defineRoles<'workflows' | 'workflow_versions' | 'workflow_runs' | 'workflow_steps'>({
  admin: ['*'],
  builder: ['workflows.*', 'workflow_versions.read', 'workflow_runs.*', 'workflow_steps.read'],
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
    admin = createAdmin({ resources, views, db, authenticate: (request) => ({ user: { id: request.headers.get('x-user')!, roles: people[request.headers.get('x-user')!]! }, tenant: '1' }), workflows, options: { roles } })
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
  const steps = async (id: string) =>
    (await sql<Record<string, unknown>>`select scope, seq, state, status, attempt, input, output, logs, error, started_at, finished_at, duration_ms from workflows.steps where run_id = ${id} order by id`.execute(db)).rows

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

  it('runs a branch and a step per item to the expected records, each with its input, output, logs and timing', async () => {
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
    for (const step of saved) expect(Number(step.duration_ms)).toBe((step.finished_at as Date).getTime() - (step.started_at as Date).getTime())
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
    expect((await steps(runId)).map(({ state, status, attempt, error }) => [state, status, attempt, error])).toEqual([
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
    for (const path of ['/workflows', '/workflow_runs', '/workflow_steps', `/workflow_runs/${runId}`]) expect([403, 404]).toContain((await as('vic', path)).status)
    expect((await as('ada', `/workflow_runs/${runId}`)).status).toBe(200)
    expect((await as('ada', `/workflow_steps?filter=${encodeURIComponent(`run_id = "${runId}"`)}`)).status).toBe(200)
  })
})
