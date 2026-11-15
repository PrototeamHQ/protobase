import { sql, type Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { defineRoles } from '@protobase/schema'
import { configExports, createAdmin, startJobs, workflowsMigration, type JobsRuntime, type WorkflowsOptions } from '@protobase/server'
import { workflowsModule } from '@protobase/server/internal'
import { openPostgresDatabase, postgresTemplateReady, statementTimeoutMs, type PostgresDatabase } from '../../test-support/postgres-database'
import { definitionFields } from '../../test-support/workflow-fields'
import { traceFiles } from './support/run-trace'
import { testRunner } from './support/test-runner'
import { customStepQueue } from '../../packages/server/src/workflows/runners/runner-jobs'
import { jobSealer } from '../../packages/server/src/workflows/runners/job-seal'

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

// Where runs keep their traces.
const trace = await traceFiles()

const roles = defineRoles<'workflows' | 'workflow_versions' | 'workflow_runs' | 'workflow_custom_steps' | 'workflow_custom_step_versions' | 'workflow_runners' | 'workflow_custom_step_jobs'>({
  keeper: ['workflows.*', 'workflow_runs.*', 'workflow_custom_steps.*', 'workflow_custom_step_versions.read', 'workflow_runners.*', 'workflow_custom_step_jobs.read'],
  author: ['workflows.*', 'workflow_runs.*', 'workflow_runners.read'],
})
// Ada keeps the custom steps and the runners; Bob only uses them; Eve keeps those of another tenant.
const people: Record<string, { roles: string[]; tenant: string }> = { ada: { roles: ['keeper'], tenant: '1' }, bob: { roles: ['author'], tenant: '1' }, eve: { roles: ['keeper'], tenant: '2' } }

const secret = 'runner-test-secret-value'
process.env.RUNNER_TEST_KEY = secret
// The app's secret, which seals jobs' arguments while they wait.
process.env.PROTOBASE_SECRET = 'runner-test-app-secret-0123456789abcdef'

const ocr = {
  name: 'ocr',
  label: 'Read text',
  container: { dockerfile: 'FROM alpine', files: {} },
  input: { type: 'object', required: ['page'], properties: { page: { type: 'string' }, key: { type: 'string' } } },
  output: { type: 'object', required: ['text'], properties: { text: { type: 'string' } } },
  error_prefix: 'Ocr',
  errors: { Unreadable: 'the page cannot be read' },
}
const step = 'custom:ocr:1'

const reading = {
  trigger: { manual: {} },
  stateMachine: {
    QueryLanguage: 'JSONata',
    StartAt: 'Read',
    States: {
      Read: {
        Type: 'Task',
        Resource: step,
        Arguments: { page: '{% $states.context.Execution.Input.page %}', key: '{% $states.context.Secrets.RUNNER_TEST_KEY %}' },
        Assign: { read: '{% $states.result %}' },
        Catch: [{ ErrorEquals: ['Ocr.Unreadable'], Assign: { read: '{% { "unreadable": $states.errorOutput.Cause } %}' }, Next: 'Done' }],
        Next: 'Done',
      },
      Done: { Type: 'Succeed', Output: '{% $read %}' },
    },
  },
}

describe.skipIf(!(await postgresTemplateReady('jobs')))("custom steps' runners on the app's database", () => {
  let pg: PostgresDatabase
  let db: Kysely<any>
  let admin: ReturnType<typeof createAdmin>
  let runtime: JobsRuntime | undefined
  let workflow: string
  const errors: unknown[] = []
  // Short times, so claims, leases and waits are seen within a test.
  const workflows: WorkflowsOptions = { savedByRoles: async ({ id }) => people[id]?.roles ?? [], customSteps: true, secrets: ['RUNNER_TEST_KEY'], runners: { claimSeconds: 2, leaseSeconds: 1, coldWaitSeconds: 1.5, warmWaitSeconds: 0.5 } }

  // The app's admin, with these workflows options, over the test's database.
  const adminOf = (options: WorkflowsOptions) => {
    const { resources, views } = configExports(workflowsModule(options))
    return createAdmin({
      resources, views, db, files: trace.files, workflows: options,
      authenticate: (request) => {
        const person = people[request.headers.get('x-user')!]!
        return { user: { id: request.headers.get('x-user')!, roles: person.roles }, tenant: person.tenant }
      },
      options: { statementTimeoutMs, roles },
    })
  }

  beforeAll(async () => {
    pg = await openPostgresDatabase('jobs')
    db = pg.db
    await pg.exec((await workflowsMigration(db, workflows))!)
    admin = adminOf(workflows)
    runtime = await startJobs({ db, jobs: admin.jobs, pollSeconds: 0.5, shutdownSeconds: 5, onError: (error) => errors.push(error) })
    expect((await as('ada', '/workflow_custom_steps', { method: 'POST', body: ocr })).status).toBe(201)
    workflow = String((await created('bob', '/workflows', { name: 'Read pages', ...definitionFields(reading) })).id)
  })

  afterAll(async () => {
    await trace.folder.remove()
    await runtime?.stop()
    await pg?.close()
    expect(errors).toEqual([])
  })

  const as = (user: string, path: string, init: { method?: string; body?: unknown; etag?: string } = {}) =>
    admin.request(path.startsWith('/api/') ? path : `/api/v1${path}`, { method: init.method ?? 'GET', headers: { 'content-type': 'application/json', 'x-user': user, 'if-match': init.etag ?? '*' }, ...(init.body !== undefined && { body: JSON.stringify(init.body) }) })
  const created = async (user: string, path: string, body: unknown) => {
    const response = await as(user, path, { method: 'POST', body })
    if (response.status !== 201) throw new Error(await response.text())
    return (await response.json()) as Record<string, unknown>
  }
  const fetch = (path: string, init: RequestInit) => admin.request(path, init)
  // A runner made by Ada, issued its one-time token and registered with it.
  const registered = async (name: string) => {
    const runner = await created('ada', '/workflow_runners', { name })
    const issued = await as('ada', `/api/workflows/runners/${String(runner.id)}/registration`, { method: 'POST' })
    const { token } = (await issued.json()) as { token: string }
    const machine = testRunner(fetch)
    expect((await machine.register(token)).status).toBe(200)
    return Object.assign(machine, { id: String(runner.id) })
  }
  const start = async (page: string) => String((await created('bob', '/workflow_runs', { workflow_id: workflow, input: { page } })).id)
  const run = async (id: string) => (await sql<{ status: string; output: unknown; error: string | null; cause: string | null }>`select status, output, error, cause from workflows.runs where id = ${id}`.execute(db)).rows[0]!
  const ended = async (id: string) => {
    await vi.waitFor(async () => expect((await run(id)).status).toMatch(/succeeded|failed/), { timeout: 20_000, interval: 50 })
    return run(id)
  }
  const job = async (id: string) =>
    (await sql<{ status: string; runner_id: string | null; requeues: number; arguments: string | null; input: unknown; logs: { message: string }[]; error: string | null; queued_at: Date; passed_over_at: Date | null; claimed_at: Date | null }>`select status, runner_id, requeues, arguments, input, logs, error, queued_at, passed_over_at, claimed_at from workflows.custom_step_jobs where id = ${id}`.execute(db)).rows[0]!
  const jobOf = async (runId: string) => {
    await vi.waitFor(async () => expect((await sql`select 1 from workflows.custom_step_jobs where run_id = ${runId}`.execute(db)).rows).toHaveLength(1), { timeout: 10_000, interval: 50 })
    return (await sql<{ id: string }>`select id from workflows.custom_step_jobs where run_id = ${runId}`.execute(db)).rows[0]!.id
  }

  it('adds the runners and jobs tables with custom steps, and nothing more once they are there', async () => {
    const { rows } = await sql<{ runners: boolean; jobs: boolean }>`select to_regclass('workflows.runners') is not null as runners, to_regclass('workflows.custom_step_jobs') is not null as jobs`.execute(db)
    expect(rows[0]).toEqual({ runners: true, jobs: true })
    expect(await workflowsMigration(db, workflows)).toBeUndefined()
  })

  it('registers a runner once with its one-time token, refusing it used, expired or of no runner by name, and keeps only hashes', async () => {
    const runner = await created('ada', '/workflow_runners', { name: 'Builder', labels: ['linux'] })
    const id = String(runner.id)
    expect(runner).toMatchObject({ name: 'Builder', labels: ['linux'], revoked: false, registered_at: null, kinds: [] })
    expect(runner).not.toHaveProperty('registration_hash')
    // Only who may change the runner issues its token
    expect((await as('bob', `/api/workflows/runners/${id}/registration`, { method: 'POST' })).status).toBe(404)
    expect((await as('eve', `/api/workflows/runners/${id}/registration`, { method: 'POST' })).status).toBe(404)
    const issued = await as('ada', `/api/workflows/runners/${id}/registration`, { method: 'POST' })
    expect(issued.status).toBe(200)
    expect(issued.headers.get('cache-control')).toBe('no-store')
    const { token, expires_at } = (await issued.json()) as { token: string; expires_at: string }
    expect(token).toMatch(/^pbr_once_[A-Za-z0-9_-]{43}$/)
    expect(new Date(expires_at).getTime() - Date.now()).toBeGreaterThan(3590_000)

    const machine = testRunner(fetch)
    const answer = await machine.register(token)
    expect(answer.status).toBe(200)
    expect(await answer.json()).toEqual({ runner: { id, name: 'Builder', labels: ['linux'], tenant: '1' }, token: expect.stringMatching(/^pbr_[A-Za-z0-9_-]{43}$/) })
    const kept = (await sql<Record<string, unknown>>`select registration_hash, token_hash, platform, kinds, registered_at from workflows.runners where id = ${id}`.execute(db)).rows[0]!
    expect(kept).toMatchObject({ platform: 'linux/amd64', kinds: ['container'], registered_at: expect.any(Date) })
    expect(JSON.stringify(kept)).not.toContain(token.slice(9))
    expect(JSON.stringify(kept)).not.toContain(machine.token!.slice(4))

    const again = await testRunner(fetch).register(token)
    expect([again.status, (await again.json()).title]).toEqual([409, 'RegistrationTokenUsed'])
    expect((await as('ada', `/api/workflows/runners/${id}/registration`, { method: 'POST' })).status).toBe(409)

    const late = await created('ada', '/workflow_runners', { name: 'Late' })
    const lateToken = ((await (await as('ada', `/api/workflows/runners/${String(late.id)}/registration`, { method: 'POST' })).json()) as { token: string }).token
    await sql`update workflows.runners set registration_expires_at = now() - interval '1 second' where id = ${String(late.id)}`.execute(db)
    const expired = await testRunner(fetch).register(lateToken)
    expect([expired.status, (await expired.json()).title]).toEqual([410, 'RegistrationTokenExpired'])
    const none = await testRunner(fetch).register(`pbr_once_${'a'.repeat(43)}`)
    expect([none.status, (await none.json()).title]).toEqual([401, 'InvalidRegistrationToken'])
    expect((await as('ada', '/workflow_runners', { method: 'POST', body: { name: 'Bad', labels: 'gpu' } })).status).toBe(400)
  })

  it('answers a held claim with a job as one is queued, and runs it end to end: heartbeat, logs and an output the run goes on with', async () => {
    const machine = await registered('Worker')
    expect((await machine.raw('/claim', { platform: 'linux/amd64', kinds: ['container'], capacity: { slots: -1 } })).status).toBe(400)
    const claim = machine.claim({ instances: [{ step, free: 2 }] })
    // The claim is held, and the run's job is placed with it as the run queues it
    await vi.waitFor(async () => expect((await sql`select 1 from workflows.runners where id = ${machine.id} and polling_until > now()`.execute(db)).rows).toHaveLength(1), { timeout: 5000, interval: 25 })
    const id = await start('page one')
    const claimed = await claim
    // Only the claim answer opens the arguments; the runner gets no task token, as it proves itself with its own
    expect(claimed).toEqual({ id: expect.any(String), step, input: { page: 'page one', key: secret }, deadline: expect.any(String), heartbeat_seconds: 1 / 3, lease_seconds: 1, files: [], output_files: [], build: { dockerfile: 'FROM alpine', files: {} } })
    expect(await run(id)).toMatchObject({ status: 'waiting' })
    const kept = await job(claimed!.id)
    expect(kept).toMatchObject({ status: 'running', runner_id: machine.id, input: { page: 'page one', key: '[redacted]' } })
    expect(kept.arguments).toEqual(expect.any(String))
    expect(kept.arguments).not.toContain(secret)
    expect(kept.arguments).not.toContain('page one')
    expect((await sql`select column_name from information_schema.columns where table_schema = 'workflows' and table_name = 'custom_step_jobs' and column_name = 'token'`.execute(db)).rows).toEqual([])

    expect(await machine.heartbeat(claimed!.id)).toEqual({ stop: false })
    await machine.log(claimed!.id, ['reading page one', `with ${secret}`])
    // The jobs resource shows no arguments, nor the secret
    const read = (await (await as('ada', `/workflow_custom_step_jobs/${claimed!.id}`)).json()) as Record<string, unknown>
    expect(read).toMatchObject({ step, status: 'running', run_id: id, runner_id: machine.id, input: { page: 'page one', key: '[redacted]' } })
    expect(read).not.toHaveProperty('arguments')
    expect(JSON.stringify(read)).not.toContain(secret)
    expect(read.logs).toEqual([expect.objectContaining({ message: 'reading page one' }), expect.objectContaining({ message: 'with [redacted]' })])

    expect((await machine.complete(claimed!.id, { output: { text: 'Hello' } })).status).toBe(200)
    expect(await ended(id)).toMatchObject({ status: 'succeeded', output: { text: 'Hello' } })
    expect(await job(claimed!.id)).toMatchObject({ status: 'succeeded', arguments: null })
    // Once it ended, the job is no longer the runner's to answer
    expect(await machine.heartbeat(claimed!.id)).toEqual({ stop: true })
    expect((await machine.complete(claimed!.id, { output: { text: 'Again' } })).status).toBe(409)
  })

  it('fails with a declared error under its prefix, which a Catch takes, and an output that does not fit with Custom.InvalidOutput', async () => {
    const machine = await registered('Failing')
    const first = await start('blurred')
    const refused = await machine.claimJob()
    expect((await machine.complete(refused.id, { error: 'Unreadable', cause: 'too blurred' })).status).toBe(200)
    expect(await ended(first)).toMatchObject({ status: 'succeeded', output: { unreadable: 'too blurred' } })
    expect(await job(refused.id)).toMatchObject({ status: 'failed', error: 'Ocr.Unreadable' })

    const second = await start('odd')
    const odd = await machine.claimJob()
    expect((await machine.complete(odd.id, { output: { text: 3 } })).status).toBe(200)
    expect(await ended(second)).toMatchObject({ status: 'failed', error: 'Custom.InvalidOutput', cause: "The output does not fit the step's output schema: output/text must be string" })

    // An error the version does not declare goes into the cause, with any secret in it blanked out
    const third = await start('leaky')
    const leaky = await machine.claimJob()
    expect((await machine.complete(leaky.id, { error: `request failed with ${secret}`, cause: 'no answer' })).status).toBe(200)
    const failed = await ended(third)
    expect(failed).toMatchObject({ status: 'failed', error: 'Custom.Failed' })
    expect(failed.cause).toContain('request failed with')
    expect(JSON.stringify([failed, await job(leaky.id)])).not.toContain(secret)
  })

  it('queues no job for a run that ended, saying so', async () => {
    const run = await start('ended')
    await vi.waitFor(async () => expect(await sql`select 1 from workflows.custom_step_jobs where run_id = ${run}`.execute(db).then(({ rows }) => rows.length)).toBe(1), { timeout: 10_000, interval: 50 })
    await sql`update workflows.runs set status = 'failed', finished_at = now() where id = ${run}`.execute(db)
    const queue = customStepQueue('workflows', jobSealer(async () => 'a-secret-for-the-ended-run-test-0123456789'), () => {})
    await expect(queue.queue(db, { run, visit: 'again|1', state: 'Read', step: 'custom:ocr:1', input: {}, arguments: {}, hash: 'b'.repeat(64) })).rejects.toThrow('Its run ended before its job was queued')
    expect((await sql`select 1 from workflows.custom_step_jobs where run_id = ${run} and visit = 'again|1'`.execute(db)).rows).toEqual([])
  })

  it('times a job out with its try, the queue included, and tells the runner holding it to stop', async () => {
    const machine = await registered('Slow')
    const quick = { ...reading, stateMachine: { ...reading.stateMachine, States: { ...reading.stateMachine.States, Read: { ...reading.stateMachine.States.Read, TimeoutSeconds: 3 } } } }
    const flow = String((await created('bob', '/workflows', { name: 'Read quickly', ...definitionFields(quick) })).id)
    const id = String((await created('bob', '/workflow_runs', { workflow_id: flow, input: { page: 'slow' } })).id)
    const held = await machine.claimJob({ images: [{ step, snapshot: true }] })
    // It works on, with heartbeats, until its try's time is up
    await vi.waitFor(async () => expect(await machine.heartbeat(held.id)).toEqual({ stop: true }), { timeout: 10_000, interval: 250 })
    expect(await ended(id)).toMatchObject({ status: 'failed', error: 'States.Timeout' })
    expect(await job(held.id)).toMatchObject({ status: 'timed_out', error: 'States.Timeout', arguments: null })
    expect((await machine.complete(held.id, { output: { text: 'Late' } })).status).toBe(409)
  })

  it('puts a job whose lease ran out back in the queue once, then fails it with States.HeartbeatTimeout', async () => {
    const machine = await registered('Silent')
    const id = await start('silent')
    const first = await machine.claimJob()
    // No heartbeat comes, so the job goes back to the queue, for the next claim
    await vi.waitFor(async () => expect(await job(first.id)).toMatchObject({ status: 'queued', requeues: 1, runner_id: null }), { timeout: 10_000, interval: 50 })
    expect(await machine.heartbeat(first.id)).toEqual({ stop: true })
    const second = await machine.claimJob()
    expect(second.id).toBe(first.id)
    expect(await ended(id)).toMatchObject({ status: 'failed', error: 'States.HeartbeatTimeout' })
    expect(await job(first.id)).toMatchObject({ status: 'timed_out', error: 'States.HeartbeatTimeout', arguments: null })
  })

  it('refuses a revoked runner\'s token from its next call on, puts its jobs back in the queue, and keeps it revoked', async () => {
    const holder = await registered('Revoked')
    const id = await start('revoked')
    const held = await holder.claimJob()
    const read = await as('ada', `/workflow_runners/${holder.id}`)
    expect((await as('ada', `/workflow_runners/${holder.id}`, { method: 'PATCH', body: { revoked: true }, etag: read.headers.get('etag')! })).status).toBe(200)
    expect(await job(held.id)).toMatchObject({ status: 'queued', runner_id: null })
    expect((await holder.raw(`/jobs/${held.id}/heartbeat`, {})).status).toBe(401)
    expect((await holder.raw('/claim', { platform: 'linux/amd64', kinds: ['container'], capacity: { slots: 1 } })).status).toBe(401)
    expect((await as('ada', `/workflow_runners/${holder.id}`, { method: 'PATCH', body: { revoked: false } })).status).toBe(400)
    expect(((await (await as('ada', `/workflow_runners/${holder.id}`)).json()) as { revoked_at: string | null }).revoked_at).not.toBeNull()

    // Another runner takes the job over and ends it
    const other = await registered('Takes over')
    const taken = await other.claimJob()
    expect(taken.id).toBe(held.id)
    expect((await other.complete(taken.id, { output: { text: 'Taken' } })).status).toBe(200)
    expect(await ended(id)).toMatchObject({ status: 'succeeded', output: { text: 'Taken' } })

    // Deleting a runner refuses its token as well
    expect((await as('ada', `/workflow_runners/${other.id}`, { method: 'DELETE' })).status).toBe(204)
    expect((await other.raw('/claim', { platform: 'linux/amd64', kinds: ['container'], capacity: { slots: 1 } })).status).toBe(401)
  })

  it('places a job with a hot runner over a cold one, and has it wait for a hot runner only while one exists', async () => {
    const cold = await registered('Cold')
    const hot = await registered('Hot')
    const polling = (machine: { id: string }) => vi.waitFor(async () => expect((await sql`select 1 from workflows.runners where id = ${machine.id} and polling_until > now()`.execute(db)).rows).toHaveLength(1), { timeout: 5000, interval: 25 })
    const warm = { instances: [{ step, free: 1 }] }

    // Both claim: the hot one takes it at once
    const coldClaim = cold.claim()
    const hotClaim = hot.claim(warm)
    await polling(cold)
    await polling(hot)
    const first = await start('both')
    const taken = await hotClaim
    expect(taken?.step).toBe(step)
    expect((await job(taken!.id)).passed_over_at).toBeNull()
    expect((await hot.complete(taken!.id, { output: { text: 'Hot' } })).status).toBe(200)
    expect(await coldClaim).toBeUndefined()
    expect(await ended(first)).toMatchObject({ status: 'succeeded', output: { text: 'Hot' } })

    // The hot runner is busy, with no free slot but its warm instance: the job waits for it, then takes the cold runner
    let busy = true
    const busyClaims = (async () => {
      while (busy) await hot.claim({ capacity: { slots: 0 }, instances: [{ step, free: 0 }] })
    })()
    await polling(hot)
    const second = await start('waits')
    const waited = await cold.claimJob()
    const placed = await job(waited.id)
    expect(placed.runner_id).toBe(cold.id)
    expect(placed.claimed_at!.getTime() - placed.passed_over_at!.getTime()).toBeGreaterThanOrEqual(1500)
    await cold.complete(waited.id, { output: { text: 'Cold' } })
    expect(await ended(second)).toMatchObject({ status: 'succeeded', output: { text: 'Cold' } })

    // While the job waits, the hot runner frees up and takes it
    const third = await start('freed')
    const thirdJob = await jobOf(third)
    const coldWaiting = cold.claim()
    await vi.waitFor(async () => expect((await job(thirdJob)).passed_over_at).not.toBeNull(), { timeout: 5000, interval: 25 })
    busy = false
    const freed = await hot.claim(warm)
    await busyClaims
    expect(freed?.id).toBe(thirdJob)
    expect((await hot.complete(thirdJob, { output: { text: 'Freed' } })).status).toBe(200)
    expect(await coldWaiting).toBeUndefined()
    expect(await ended(third)).toMatchObject({ status: 'succeeded', output: { text: 'Freed' } })

    // With no runner of the tenant holding its image, the job takes the cold runner at once
    const fourth = await start('alone')
    const alone = await cold.claimJob()
    expect((await job(alone.id)).passed_over_at).toBeNull()
    await cold.complete(alone.id, { output: { text: 'Alone' } })
    expect(await ended(fourth)).toMatchObject({ status: 'succeeded', output: { text: 'Alone' } })
  })

  it('answers a claim held open with none at once as it stops holding, and each claim after it, and holds no claim open for the runner', async () => {
    // A process of its own, whose claims are held half a minute, with a runner of Eve's tenant, which queues no job here.
    const closing = adminOf({ ...workflows, runners: { ...workflows.runners, claimSeconds: 30 } })
    const runner = await created('eve', '/workflow_runners', { name: 'Closing' })
    const { token } = (await (await as('eve', `/api/workflows/runners/${String(runner.id)}/registration`, { method: 'POST' })).json()) as { token: string }
    const machine = testRunner((path, init) => closing.request(path, init))
    expect((await machine.register(token)).status).toBe(200)
    const pollingUntil = async () => (await sql<{ polling_until: Date | null }>`select polling_until from workflows.runners where id = ${String(runner.id)}`.execute(db)).rows[0]!.polling_until

    const held = machine.claim()
    await vi.waitFor(async () => expect(await pollingUntil()).not.toBeNull(), { timeout: 5000, interval: 25 })
    const started = Date.now()
    await closing.stopHolding()
    expect(await held).toBeUndefined()
    expect(Date.now() - started).toBeLessThan(5000)
    expect(await pollingUntil()).toBeNull()

    const after = Date.now()
    expect(await machine.claim()).toBeUndefined()
    expect(Date.now() - after).toBeLessThan(5000)
    expect(await pollingUntil()).toBeNull()
  })
})
