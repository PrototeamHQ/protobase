import { sql, type Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { defineRoles, f, resource } from '@protobase/schema'
import { changesMigration, configExports, createAdmin, startJobs, workflowsMigration, type JobsRuntime, type WorkflowsOptions } from '@protobase/server'
import { workflowsModule } from '@protobase/server/internal'
import example from '../../test-support/workflow-plugin-example'
import { openPostgresDatabase, postgresTemplateReady, type PostgresDatabase } from '../../test-support/postgres-database'

// Workers poll on real timers, which a busy machine stretches.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

const invoices = resource('invoices')
  .table('invoices')
  .fields({
    id: f.integer().readOnly(),
    organization_id: f.integer(),
    status: f.enum(['draft', 'sent', 'paid']).filterable(),
    due_at: f.timestamp().filterable(),
    note: f.text().optional(),
  })
  .primaryKey((r) => r.id)
  .tenant((r) => r.organization_id)
  .events((e) => e.crud())

const roles = defineRoles<'workflows' | 'workflow_versions' | 'workflow_runs' | 'workflow_steps' | 'workflow_triggers' | 'invoices'>({
  builder: ['workflows.*', 'workflow_versions.read', 'workflow_runs.*', 'workflow_steps.read', 'workflow_triggers.read', 'invoices.*'],
})
const people: Record<string, number> = { ada: 1, bob: 2 }
// Users whose roles a test takes away for a while.
const revoked = new Set<string>()
const workflows: WorkflowsOptions = {
  savedByRoles: async ({ id, tenant }) => (String(people[id]) === String(tenant) && !revoked.has(id) ? ['builder'] : []),
  plugins: [{ plugin: example, source: 'workflow-plugin-example' }],
}

const day = 86_400_000
const ago = (ms: number) => new Date(Date.now() - ms).toISOString()
const until = async <T>(read: () => Promise<T>, done: (value: T) => boolean, ms = 15_000) => {
  const end = Date.now() + ms
  for (;;) {
    const value = await read()
    if (done(value) || Date.now() > end) return value
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
}

describe.skipIf(!(await postgresTemplateReady('jobs')))('record triggers, turned on and off while the app runs', () => {
  let pg: PostgresDatabase
  let db: Kysely<any>
  let admin: ReturnType<typeof createAdmin>
  let runtime: JobsRuntime

  beforeAll(async () => {
    pg = await openPostgresDatabase('jobs')
    db = pg.db
    await pg.exec('create table invoices (id integer generated always as identity primary key, organization_id integer not null, status text not null, due_at timestamptz not null, note text)')
    await pg.exec('create index on invoices (organization_id, status); create index on invoices (due_at)')
    await pg.exec((await changesMigration(db, [invoices.toModel()]))!)
    await pg.exec((await workflowsMigration(db, workflows))!)
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const { resources, views } = configExports({ invoices, ...workflowsModule(workflows) })
    admin = createAdmin({
      resources,
      views,
      db,
      authenticate: (request) => {
        const id = request.headers.get('x-user')!
        return { user: { id, roles: ['builder'] }, tenant: people[id]!, organization: { id: people[id]! } }
      },
      workflows,
      options: { roles },
    })
    runtime = await startJobs({ db, jobs: admin.jobs, pollSeconds: 0.5, shutdownSeconds: 5, onError: (error) => { throw error } })
  })

  afterAll(async () => {
    await runtime?.stop()
    await pg?.close()
  })

  const as = async (user: string, path: string, method = 'GET', body?: unknown) => {
    const response = await admin.request(`/api/v1${path}`, { method, headers: { 'content-type': 'application/json', 'if-match': '*', 'x-user': user }, ...(body !== undefined && { body: JSON.stringify(body) }) })
    return { status: response.status, body: (await response.json().catch(() => null)) as Record<string, any> }
  }
  const invoice = async (user: string, data: Record<string, unknown>) => (await as(user, '/invoices', 'POST', data)).body.id as number
  const runsOf = async (workflow: string) =>
    (await sql<{ key: string; input: { record: { id: number } }; status: string }>`select key, input, status from workflows.runs where workflow_id = ${workflow} order by created_at`.execute(db)).rows
  const triggersOf = async (workflow: string) => (await sql<{ id: string; status: string; version: number }>`select id, status, version from workflows.triggers where workflow_id = ${workflow}`.execute(db)).rows
  const machine = { QueryLanguage: 'JSONata', StartAt: 'Done', States: { Done: { Type: 'Succeed', Output: '{% $states.context.Execution.Input.record.id %}' } } }
  const save = async (user: string, trigger: unknown) => (await as(user, '/workflows', 'POST', { name: 'Remind', definition: { trigger, stateMachine: machine } })).body
  const enable = (user: string, id: string, version: number | null) => as(user, `/workflows/${id}`, 'PATCH', { enabled_version: version })

  it('starts one run for each record already ready as it is turned on, and one as a write makes a record ready, in its tenant only', async () => {
    const ready = await invoice('ada', { status: 'sent', due_at: ago(10 * day) })
    await invoice('bob', { status: 'sent', due_at: ago(10 * day) })
    const workflow = await save('ada', { 'app:record': { resource: 'invoices', when: "status = 'sent' AND due_at <= now() - 3d" } })
    expect((await enable('ada', workflow.id, 1)).status).toBe(200)
    expect(await until(() => runsOf(workflow.id), (runs) => runs.length >= 1)).toMatchObject([{ input: { record: { id: ready } } }])

    const draft = await invoice('ada', { status: 'draft', due_at: ago(10 * day) })
    await as('ada', `/invoices/${draft}`, 'PATCH', { status: 'sent' })
    await until(() => runsOf(workflow.id), (runs) => runs.length >= 2)
    await as('ada', `/invoices/${draft}`, 'PATCH', { note: 'still sent' })
    await new Promise((resolve) => setTimeout(resolve, 1500))
    const runs = await runsOf(workflow.id)
    expect(runs.map((run) => run.input.record.id)).toEqual([ready, draft])
    expect(runs.every((run) => run.input.record.id !== undefined)).toBe(true)
  })

  it('starts a run when the time in a record comes, with no write, and none when it stopped being ready before then', async () => {
    const workflow = await save('ada', { 'app:record': { resource: 'invoices', when: "status = 'sent' AND due_at <= now() - 3d" } })
    await enable('ada', workflow.id, 1)
    // The two invoices of the test before are ready already: the pass as it is turned on starts theirs.
    const earlier = await until(() => runsOf(workflow.id), (found) => found.length >= 2)
    const soon = await invoice('ada', { status: 'sent', due_at: ago(3 * day - 3000) })
    const changed = await invoice('ada', { status: 'sent', due_at: ago(3 * day - 3000) })
    // Draft, not paid: the next test's trigger reads paid invoices and must find none from this one.
    await as('ada', `/invoices/${changed}`, 'PATCH', { status: 'draft' })
    const later = async () => (await runsOf(workflow.id)).slice(earlier.length).map((run) => run.input.record.id)
    expect(await later()).toEqual([])
    await until(later, (ids) => ids.length >= 1)
    await new Promise((resolve) => setTimeout(resolve, 1500))
    expect(await later()).toEqual([soon])
  })

  it('keeps its trigger across a version with the same trigger, and stops it when turned off', async () => {
    const workflow = await save('ada', { 'app:record': { resource: 'invoices', when: "status = 'paid'" } })
    await enable('ada', workflow.id, 1)
    const [first] = await triggersOf(workflow.id)
    await as('ada', `/workflows/${workflow.id}`, 'PATCH', { description: 'the same trigger', definition: { trigger: { 'app:record': { resource: 'invoices', when: "status = 'paid'" } }, stateMachine: { ...machine, Comment: 'v2' } } })
    // A save leaves what is published alone; publishing moves the trigger along
    expect(await triggersOf(workflow.id)).toEqual([first])
    expect((await as('ada', `/workflows/${workflow.id}`)).body.enabled_version).toBe(1)
    await enable('ada', workflow.id, 2)
    expect(await triggersOf(workflow.id)).toEqual([{ ...first, version: 2 }])
    await enable('ada', workflow.id, null)
    expect(await until(() => triggersOf(workflow.id), (rows) => rows.length === 0)).toEqual([])
    await invoice('ada', { status: 'paid', due_at: ago(day) })
    await new Promise((resolve) => setTimeout(resolve, 1500))
    expect(await runsOf(workflow.id)).toEqual([])
  })

  it('marks its trigger failing while the saver holds no role, then works again and starts the records it missed', async () => {
    const workflow = await save('ada', { 'app:record': { resource: 'invoices', when: "status = 'sent' AND due_at <= now() - 300d" } })
    await enable('ada', workflow.id, 1)
    await until(() => triggersOf(workflow.id), (rows) => rows.length === 1)
    revoked.add('ada')
    const missed = await invoice('ada', { status: 'sent', due_at: ago(400 * day) })
    expect(await until(() => triggersOf(workflow.id), (rows) => rows[0]?.status === 'failing')).toMatchObject([{ status: 'failing' }])
    revoked.delete('ada')
    const later = await invoice('ada', { status: 'sent', due_at: ago(400 * day) })
    const ids = await until(async () => (await runsOf(workflow.id)).map((run) => run.input.record.id), (found) => found.length >= 2)
    expect(ids.toSorted()).toEqual([missed, later].toSorted())
    expect(await triggersOf(workflow.id)).toMatchObject([{ status: 'active' }])
    await enable('ada', workflow.id, null)
  })

  it('refuses a when with now() inside an OR, or on a field not indexed for filtering, and turning on a version never saved', async () => {
    const or = await as('ada', '/workflows', 'POST', { name: 'Bad', definition: { trigger: { 'app:record': { resource: 'invoices', when: "status = 'sent' OR due_at <= now()" } }, stateMachine: machine } })
    expect(or.status).toBe(400)
    expect(JSON.stringify(or.body.problems)).toContain('uses now() other than as')
    const unindexed = await as('ada', '/workflows', 'POST', { name: 'Bad', definition: { trigger: { 'app:record': { resource: 'invoices', when: "note = 'x'" } }, stateMachine: machine } })
    expect(unindexed.status).toBe(400)
    const workflow = await save('ada', { 'app:record': { resource: 'invoices' } })
    await as('ada', `/workflows/${workflow.id}`, 'PATCH', { definition: { trigger: { 'app:record': { resource: 'invoices', when: "status = 'paid'" } }, stateMachine: machine } })
    expect((await enable('ada', workflow.id, 3)).status).toBe(400)
    // A version saved before the latest publishes as any other, as going back to it does
    expect((await enable('ada', workflow.id, 1)).status).toBe(200)
    expect((await triggersOf(workflow.id)).map((row) => row.version)).toEqual([1])
    await enable('ada', workflow.id, null)
  })

  it("runs a plugin's own trigger and step from a package of its own, as it runs the built-in ones", async () => {
    const shout = { QueryLanguage: 'JSONata', StartAt: 'Shout', States: { Shout: { Type: 'Task', Resource: 'example:shout', Arguments: { text: '{% $states.context.Execution.Input.record.note %}' }, Output: '{% $states.result.text %}', End: true } } }
    const workflow = (await as('ada', '/workflows', 'POST', { name: 'Shout', definition: { trigger: { 'example:new_note': { resource: 'invoices' } }, stateMachine: shout } })).body
    await enable('ada', workflow.id, 1)
    const id = await invoice('ada', { status: 'draft', due_at: ago(day), note: 'hello' })
    const runOf = async () => (await sql<{ status: string; output: unknown }>`select status, output from workflows.runs where workflow_id = ${workflow.id} and (input->'record'->>'id')::int = ${id}`.execute(db)).rows
    expect(await until(runOf, (runs) => runs[0]?.status === 'succeeded')).toEqual([{ status: 'succeeded', output: 'HELLO' }])
  })
})
