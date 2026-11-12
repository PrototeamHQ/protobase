import { sql, type Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { defineRoles } from '@protobase/schema'
import { configExports, createAdmin, startJobs, unauthorized, workflowsMigration, type JobsRuntime, type WorkflowsOptions } from '@protobase/server'
import { workflowsModule } from '@protobase/server/internal'
import { openPostgresDatabase, postgresTemplateReady, statementTimeoutMs, type PostgresDatabase } from '../../test-support/postgres-database'
import { traceFiles } from './support/run-trace'

vi.setConfig({ testTimeout: 60_000, hookTimeout: 30_000 })

// Where runs keep their traces.
const trace = await traceFiles()

const roles = defineRoles<'workflows' | 'workflow_versions' | 'workflow_runs'>({
  builder: ['workflows.*', 'workflow_versions.read', 'workflow_runs.*'],
  reader: ['workflows.read', 'workflow_runs.read'],
  blind: ['workflows.read'],
  wide: ['*.read'],
})
const people: Record<string, string[]> = { ada: ['builder'], reed: ['reader'], bella: ['blind'], walt: ['wide'] }
const workflows: WorkflowsOptions = { savedByRoles: async ({ id }) => people[id] ?? [] }

// Fails when its input says so, waits when it says so, and succeeds otherwise.
const definition = (name = 'Done') => ({
  trigger: { manual: {} },
  stateMachine: {
    QueryLanguage: 'JSONata',
    StartAt: 'Pick',
    States: {
      Pick: {
        Type: 'Choice',
        Choices: [
          { Condition: '{% $states.context.Execution.Input.fail = true %}', Next: 'Boom' },
          { Condition: '{% $states.context.Execution.Input.wait = true %}', Next: 'Hold' },
        ],
        Default: name,
      },
      Boom: { Type: 'Fail', Error: 'Boom' },
      Hold: { Type: 'Wait', Seconds: 600, Next: name },
      [name]: { Type: 'Succeed' },
    },
  },
})

describe.skipIf(!(await postgresTemplateReady('jobs')))("a workflow's status from its last ended runs", () => {
  let pg: PostgresDatabase
  let db: Kysely<any>
  let admin: ReturnType<typeof createAdmin>
  let runtime: JobsRuntime

  beforeAll(async () => {
    pg = await openPostgresDatabase('jobs')
    db = pg.db
    await pg.exec((await workflowsMigration(db, workflows))!)
    const { resources, views } = configExports(workflowsModule(workflows))
    const authenticate = (request: Request) => {
      const id = request.headers.get('x-user') ?? ''
      if (!people[id]) throw unauthorized('Sign in first')
      return { user: { id, roles: people[id] }, tenant: '1' }
    }
    admin = createAdmin({ resources, views, db, files: trace.files, authenticate, workflows, options: { statementTimeoutMs, roles } })
    runtime = await startJobs({ db, jobs: admin.jobs, pollSeconds: 0.5, shutdownSeconds: 5, onError: (error) => { throw error } })
  })

  afterAll(async () => {
    await trace.folder.remove()
    await runtime?.stop()
    await pg?.close()
  })

  const as = (user: string, path: string, init: { method?: string; body?: unknown } = {}) =>
    admin.request(`/api/v1${path}`, {
      method: init.method ?? 'GET',
      headers: { 'content-type': 'application/json', 'if-match': '*', 'x-user': user },
      ...(init.body !== undefined && { body: JSON.stringify(init.body) }),
    })
  const created = async (response: Response) => {
    if (response.status !== 201) throw new Error(await response.text())
    return (await response.json()).id as string
  }
  const runStatus = async (id: string) => (await sql<{ status: string }>`select status from workflows.runs where id = ${id}`.execute(db)).rows[0]!.status
  const newWorkflow = async (name: string) => created(await as('ada', '/workflows', { method: 'POST', body: { name, definition: definition() } }))
  // Starts a run and waits until it reaches `until`: an ended status, or waiting.
  const run = async (workflow: string, input: Record<string, unknown>, until: string[] = ['succeeded', 'failed']) => {
    const id = await created(await as('ada', '/workflow_runs', { method: 'POST', body: { workflow_id: workflow, input } }))
    await vi.waitFor(async () => expect(until).toContain(await runStatus(id)), { timeout: 20_000, interval: 50 })
    return id
  }
  const status = async (workflow: string, user = 'ada') => {
    const record = await (await as(user, `/workflows/${workflow}`)).json()
    return { status: record.run_status, run: record.status_run_id, failures: record.unresolved_failures }
  }
  const resolve = (workflow: string, user = 'ada') => as(user, '/workflow_resolutions', { method: 'POST', body: { workflow_id: workflow } })

  it('starts gray, and a queued, running or waiting run changes nothing', async () => {
    const workflow = await newWorkflow('Waits')
    expect(await status(workflow)).toEqual({ status: 'no_runs', run: null, failures: 0 })
    await run(workflow, { wait: true }, ['waiting'])
    expect(await status(workflow)).toEqual({ status: 'no_runs', run: null, failures: 0 })
  })

  it('is red on a failed latest run, orange once a good run follows, and green once marked resolved', async () => {
    const workflow = await newWorkflow('Orange')
    const good = await run(workflow, {})
    expect(await status(workflow)).toEqual({ status: 'healthy', run: good, failures: 0 })
    const failed = await run(workflow, { fail: true })
    expect(await status(workflow)).toEqual({ status: 'failing', run: failed, failures: 1 })
    await run(workflow, {})
    expect(await status(workflow)).toEqual({ status: 'unresolved', run: failed, failures: 1 })
    const resolution = await resolve(workflow)
    expect(resolution.status).toBe(201)
    const after = await (await as('ada', `/workflows/${workflow}`)).json()
    expect([after.run_status, after.resolved_by, after.resolved_at]).toEqual(['healthy', 'ada', expect.any(String)])
  })

  it('goes gray on a failed latest run once marked resolved or once a new version is saved, even after good runs', async () => {
    const workflow = await newWorkflow('Gray')
    await run(workflow, {})
    await run(workflow, { fail: true })
    expect((await resolve(workflow)).status).toBe(201)
    expect(await status(workflow)).toEqual({ status: 'resolved', run: null, failures: 0 })
    const again = await run(workflow, { fail: true })
    expect(await status(workflow)).toEqual({ status: 'failing', run: again, failures: 1 })
    const { updated_at: before } = await (await as('ada', `/workflows/${workflow}`)).json()
    expect((await as('ada', `/workflows/${workflow}`, { method: 'PATCH', body: { definition: definition('Finished') } })).status).toBe(200)
    const saved = await (await as('ada', `/workflows/${workflow}`)).json()
    expect([saved.run_status, saved.version, saved.updated_at > before]).toEqual(['new_version', 2, true])
  })

  it('counts only the last 10 ended runs, so a failure older than those no longer counts', async () => {
    const workflow = await newWorkflow('Window')
    await run(workflow, { fail: true })
    for (let index = 0; index < 9; index++) await run(workflow, {})
    expect(await status(workflow)).toMatchObject({ status: 'unresolved', failures: 1 })
    const last = await run(workflow, {})
    expect(await status(workflow)).toEqual({ status: 'healthy', run: last, failures: 0 })
  })

  it('counts two runs that end at the same time, in transactions of their own', async () => {
    const workflow = await newWorkflow('Together')
    const first = await run(workflow, { wait: true }, ['waiting'])
    const second = await run(workflow, { wait: true }, ['waiting'])
    const pool = pg.pool({ max: 2 })
    const [failing, succeeding] = [await pool.connect(), await pool.connect()]
    const end = (status: string, id: string, at: string) => `update workflows.runs set status = '${status}', finished_at = '${at}' where id = '${id}'`
    const { rows: [{ pid }] } = await succeeding.query('select pg_backend_pid() as pid')
    // Reads the activity afresh on each poll: inside a transaction PostgreSQL keeps the first snapshot it took.
    const waiting = async () => {
      await failing.query('select pg_stat_clear_snapshot()')
      return (await failing.query(`select 1 from pg_stat_activity where datname = current_database() and pid = $1 and wait_event_type = 'Lock'`, [pid])).rowCount
    }
    try {
      await failing.query('begin')
      await failing.query(end('failed', first, '2026-01-01T10:00:00Z'))
      // The second run ends while the first one's transaction still holds the workflow, and waits for it to commit.
      const ended = succeeding.query(end('succeeded', second, '2026-01-01T10:00:01Z'))
      await vi.waitFor(async () => expect(await waiting()).toBe(1), { timeout: 5_000, interval: 20 })
      await failing.query('commit')
      await ended
    } finally {
      // After the commit this rollback only warns that no transaction is open.
      await failing.query('rollback')
      failing.release()
      succeeding.release()
      await pool.end()
    }
    expect(await status(workflow)).toEqual({ status: 'unresolved', run: first, failures: 1 })
  })

  it('leaves the workflow as it was edited: a run that ends does not move its updated_at', async () => {
    const workflow = await newWorkflow('Untouched')
    const { updated_at: before } = await (await as('ada', `/workflows/${workflow}`)).json()
    await run(workflow, { fail: true })
    const after = await (await as('ada', `/workflows/${workflow}`)).json()
    expect([after.run_status, after.updated_at]).toEqual(['failing', before])
  })

  it('shows the status only to who reads every run, and lets only who may change the workflow mark it resolved', async () => {
    const workflow = await newWorkflow('Guarded')
    await run(workflow, { fail: true })
    expect(await status(workflow, 'reed')).toMatchObject({ status: 'failing', failures: 1 })
    for (const user of ['bella', 'walt']) {
      const record = await (await as(user, `/workflows/${workflow}`)).json()
      expect(Object.keys(record).filter((name) => ['run_status', 'status_run_id', 'status_run_at', 'unresolved_failures'].includes(name))).toEqual([])
    }
    const list = await (await as('bella', `/workflows?filter=${encodeURIComponent('name = "Guarded"')}`)).json()
    expect(list.items[0]).not.toHaveProperty('run_status')
    const meta = await (await admin.request('/api/meta', { headers: { 'x-user': 'bella' } })).json()
    const recent = meta.views.find((view: { resource: string }) => view.resource === 'workflows').nav.recent
    expect(recent).toEqual({ orderBy: 'name asc', limit: 20 })
    for (const user of ['reed', 'bella']) expect([403, 404]).toContain((await resolve(workflow, user)).status)
    expect(await status(workflow)).toMatchObject({ status: 'failing' })
  })
})
