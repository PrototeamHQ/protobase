import { join } from 'node:path'
import { sql, type Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { defineRoles } from '@protobase/schema'
import { configExports, createAdmin, startJobs, workflowsSchemaSql, type JobsRuntime, type WorkflowsOptions } from '@protobase/server'
import { localFiles, moduleDifference, schemaModules, workflowsModule } from '@protobase/server/internal'
import { tempDir } from '../../packages/server/src/files/testing/temp-dir'
import { openPostgresDatabase, postgresTemplateReady, statementTimeoutMs, type PostgresDatabase } from '../../test-support/postgres-database'
import { definitionFields } from '../../test-support/workflow-fields'

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })
// The app's secret, which seals custom steps' jobs' arguments while they wait.
process.env.PROTOBASE_SECRET = 'custom-steps-test-app-secret-0123456789'

const roles = defineRoles<'workflows' | 'workflow_versions' | 'workflow_runs' | 'workflow_custom_steps' | 'workflow_custom_step_versions'>({
  author: ['workflows.*', 'workflow_versions.read', 'workflow_runs.*', 'workflow_custom_steps.read', 'workflow_custom_step_versions.read'],
  keeper: ['workflows.*', 'workflow_runs.*', 'workflow_custom_steps.*', 'workflow_custom_step_versions.read'],
  viewer: ['*.read'],
})
// Ada keeps the custom steps, Bob only uses them, and Vic reads everything a wildcard reaches; Eve keeps those of another tenant.
const people: Record<string, { roles: string[]; tenant: string }> = { ada: { roles: ['keeper'], tenant: '1' }, bob: { roles: ['author'], tenant: '1' }, vic: { roles: ['viewer'], tenant: '1' }, eve: { roles: ['keeper'], tenant: '2' } }

const manifest = {
  label: 'Invoice PDF',
  description: 'Renders an invoice as a PDF.',
  container: { dockerfile: 'ARG PYTHON=3.13\nFROM python:${PYTHON}-slim\nCOPY main.py .', files: { 'main.py': 'print(1)' }, command: ['python', 'main.py'] },
  input: { type: 'object', required: ['number'], properties: { number: { type: 'string' } } },
  output: { type: 'object', properties: { pdf: { 'x-file': true }, pages: { type: 'integer' } } },
  error_prefix: 'Invoice',
  errors: { Refused: 'the renderer refused the invoice' },
}

const definition = (states: Record<string, unknown>) => ({ trigger: { manual: {} }, stateMachine: { QueryLanguage: 'JSONata', StartAt: Object.keys(states)[0], States: states } })
const render = (resource: string, args: Record<string, unknown> = { number: '{% $states.context.Execution.Input.number %}', store: { configuration: 'archive' } }) =>
  definition({ Render: { Type: 'Task', Resource: resource, Arguments: args, Assign: { invoice: '{% $states.result %}' }, Next: 'Done' }, Done: { Type: 'Succeed' } })

describe.skipIf(!(await postgresTemplateReady('jobs')))('custom steps on the app\'s database', () => {
  let pg: PostgresDatabase
  let db: Kysely<any>
  let admin: ReturnType<typeof createAdmin>
  let runtime: JobsRuntime | undefined
  let folder: Awaited<ReturnType<typeof tempDir>>
  const errors: unknown[] = []
  const workflows: WorkflowsOptions = { savedByRoles: async ({ id }) => people[id]?.roles ?? [], customSteps: true }

  beforeAll(async () => {
    pg = await openPostgresDatabase('jobs')
    db = pg.db
    folder = await tempDir()
    // A schema made with custom steps off, as an app had it before turning them on
    await pg.exec(workflowsSchemaSql({ ...workflows, customSteps: false }))
    const { resources, views } = configExports(workflowsModule(workflows))
    const files = { providers: { private: localFiles({ dir: join(folder.dir, 'private') }) }, secret: 'files-secret-for-the-custom-step-tests' }
    admin = createAdmin({
      resources, views, db, files, workflows,
      authenticate: (request) => {
        const person = people[request.headers.get('x-user')!]!
        return { user: { id: request.headers.get('x-user')!, roles: person.roles }, tenant: person.tenant }
      },
      options: { statementTimeoutMs, roles },
    })
  })

  afterAll(async () => {
    await runtime?.stop()
    await pg?.close()
    await folder?.remove()
    expect(errors).toEqual([])
  })

  const as = (user: string, path: string, init: { method?: string; body?: unknown } = {}) =>
    admin.request(path.startsWith('/api/') ? path : `/api/v1${path}`, { method: init.method ?? 'GET', headers: { 'content-type': 'application/json', 'x-user': user, 'if-match': '*' }, ...(init.body !== undefined && { body: JSON.stringify(init.body) }) })
  const created = async (user: string, path: string, body: unknown) => {
    const response = await as(user, path, { method: 'POST', body })
    if (response.status !== 201) throw new Error(await response.text())
    return (await response.json()) as Record<string, unknown>
  }
  const versions = async (id: string) => (await sql<{ version: number; label: string; saved_by: string; tenant_id: string }>`select version, label, saved_by, tenant_id from workflows.custom_step_versions where custom_step_id = ${id} order by version`.execute(db)).rows
  const stepTypes = async (user: string) => ((await (await as(user, '/api/workflows/types')).json()) as { step_types: { id: string; label: string; input: Record<string, unknown> }[] }).step_types

  it('adds its tables once custom steps are turned on, and not before', async () => {
    const { rows } = await sql<{ found: boolean }>`select to_regclass('workflows.custom_steps') is not null as found`.execute(db)
    expect(rows[0]!.found).toBe(false)
    const input = { names: { schema: 'workflows' }, resources: {} }
    expect(await schemaModules.workflow_custom_steps.read(db, input)).toBeUndefined()
    const upgrade = moduleDifference(schemaModules.workflow_custom_steps, input, undefined).sql
    for (const table of ['custom_steps', 'custom_step_versions', 'runners', 'custom_step_jobs']) expect(upgrade).toContain(`create table if not exists "workflows"."${table}"`)
    await pg.exec(upgrade!)
    expect(await schemaModules.workflow_custom_steps.read(db, input)).toEqual({ lastStep: 1, replaceables: { functions: 1 }, names: input.names })
    runtime = await startJobs({ db, jobs: admin.jobs, pollSeconds: 0.5, shutdownSeconds: 5, onError: (error) => errors.push(error) })
  })

  it('keeps each changed manifest as a version, saved by its writer, and numbers none for a write that changes nothing of it', async () => {
    const step = await created('ada', '/workflow_custom_steps', { name: 'invoice_pdf', ...manifest })
    expect(step).toMatchObject({ name: 'invoice_pdf', version: 1, kind: 'container', error_prefix: 'Invoice' })
    const id = String(step.id)
    const read = await as('ada', `/workflow_custom_steps/${id}`)
    const save = (body: unknown, etag: string) => admin.request(`/api/v1/workflow_custom_steps/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json', 'x-user': 'ada', 'if-match': etag }, body: JSON.stringify(body) })
    const changed = await save({ label: 'Invoice as PDF' }, read.headers.get('etag')!)
    expect(changed.status).toBe(200)
    expect(await changed.json()).toMatchObject({ version: 2, label: 'Invoice as PDF' })
    // The old ETag no longer matches, and the same manifest again is no new version
    expect((await save({ label: 'Stale' }, read.headers.get('etag')!)).status).toBe(412)
    const same = await save({ label: 'Invoice as PDF' }, changed.headers.get('etag')!)
    expect(same.status).toBe(200)
    expect(await same.json()).toMatchObject({ version: 2 })
    expect(same.headers.get('etag')).not.toBe(changed.headers.get('etag'))
    expect(await versions(id)).toEqual([
      { version: 1, label: 'Invoice PDF', saved_by: 'ada', tenant_id: '1' },
      { version: 2, label: 'Invoice as PDF', saved_by: 'ada', tenant_id: '1' },
    ])
    const listed = await (await as('bob', `/workflow_custom_step_versions?filter=${encodeURIComponent(`custom_step_id = "${id}"`)}&order_by=version desc`)).json()
    expect(listed.items.map((row: { version: number }) => row.version)).toEqual([2, 1])
    expect((await as('ada', '/workflow_custom_step_versions', { method: 'POST', body: { custom_step_id: id, version: 3 } })).status).not.toBe(201)
  })

  it('refuses a manifest that breaks a rule, naming each field, and a rename, keeping nothing', async () => {
    const response = await as('ada', '/workflow_custom_steps', { method: 'POST', body: { name: 'Bad Name', ...manifest, container: { dockerfile: 'RUN echo', files: { '../x': '' } }, input: { type: 'object', properties: { store: {} } } } })
    expect(response.status).toBe(400)
    const problem = await response.json()
    expect(problem.detail).toContain('The custom step cannot be saved: name is a lowercase letter')
    expect(problem.problems.map((each: { field: string }) => each.field)).toEqual(['name', 'container.dockerfile', 'container.files', 'input.properties.store'])
    expect(problem.errors[1]).toEqual({ code: 'invalid-custom-step', field: 'container', message: 'container.dockerfile has no FROM instruction to start with; only ARG lines and comments may come before it', params: { field: 'container.dockerfile' } })
    expect(problem.errors.map((error: { field: string; params: { field: string } }) => [error.field, error.params.field])).toEqual([
      ['name', 'name'],
      ['container', 'container.dockerfile'],
      ['container', 'container.files'],
      ['input', 'input.properties.store'],
    ])
    expect((await sql<{ count: number }>`select count(*)::int as count from workflows.custom_steps where name = 'Bad Name'`.execute(db)).rows[0]!.count).toBe(0)

    const [{ id }] = (await sql<{ id: string }>`select id from workflows.custom_steps where name = 'invoice_pdf'`.execute(db)).rows as [{ id: string }]
    const renamed = await as('ada', `/workflow_custom_steps/${id}`, { method: 'PATCH', body: { name: 'invoice' } })
    expect(renamed.status).toBe(400)
    expect((await renamed.json()).errors).toEqual([expect.objectContaining({ field: 'name', code: 'read-only' })])
    expect((await as('ada', '/workflow_custom_steps', { method: 'POST', body: { name: 'invoice_pdf', ...manifest } })).status).toBe(409)
  })

  it('lets only the grant create, change and delete custom steps, and no wildcard read them', async () => {
    expect([403, 404]).toContain((await as('bob', '/workflow_custom_steps', { method: 'POST', body: { name: 'mine', ...manifest } })).status)
    const [{ id }] = (await sql<{ id: string }>`select id from workflows.custom_steps where name = 'invoice_pdf'`.execute(db)).rows as [{ id: string }]
    expect((await as('bob', `/workflow_custom_steps/${id}`)).status).toBe(200)
    expect([403, 404]).toContain((await as('bob', `/workflow_custom_steps/${id}`, { method: 'PATCH', body: { label: 'Mine' } })).status)
    expect([403, 404]).toContain((await as('bob', `/workflow_custom_steps/${id}`, { method: 'DELETE' })).status)
    for (const path of ['/workflow_custom_steps', `/workflow_custom_steps/${id}`, '/workflow_custom_step_versions']) expect([403, 404]).toContain((await as('vic', path)).status)
    expect(await versions(id)).toHaveLength(2)
  })

  it("lists every version of the tenant's custom steps as a step type, to whoever reads workflows, and none of another tenant's", async () => {
    const own = await stepTypes('bob')
    expect(own.filter((type) => type.id.startsWith('custom:')).map((type) => [type.id, type.label])).toEqual([['custom:invoice_pdf:1', 'Invoice PDF'], ['custom:invoice_pdf:2', 'Invoice as PDF']])
    expect(own.find((type) => type.id === 'custom:invoice_pdf:2')!.input).toMatchObject({ required: ['number', 'store'] })
    await created('eve', '/workflow_custom_steps', { name: 'payslip', ...manifest })
    expect((await stepTypes('eve')).filter((type) => type.id.startsWith('custom:')).map((type) => type.id)).toEqual(['custom:payslip:1'])
    expect((await stepTypes('bob')).map((type) => type.id)).not.toContain('custom:payslip:1')
  })

  it('saves a workflow that names a version of a custom step, checking its arguments and pins, refusing one without a version or of another tenant', async () => {
    const save = (user: string, value: unknown) => as(user, '/workflows', { method: 'POST', body: { name: 'Invoices', ...definitionFields(value) } })
    const saved = await save('bob', render('custom:invoice_pdf:1'))
    expect(saved.status).toBe(201)
    const problems = async (response: Response) => {
      expect(response.status).toBe(400)
      return ((await response.json()).problems as { state: string; field: string; message: string }[]).map(({ state, field, message }) => ({ state, field, message }))
    }
    expect(await problems(await save('bob', render('custom:invoice_pdf')))).toEqual([{ state: 'Render', field: 'Resource', message: '"custom:invoice_pdf" names no version: write custom:invoice_pdf:2' }])
    expect(await problems(await save('bob', render('custom:invoice_pdf:2', { number: '1' })))).toEqual([{ state: 'Render', field: 'Arguments.store', message: 'is missing; custom:invoice_pdf:2 needs it' }])
    // Its output is typed by its manifest: a number of pages is no text
    const pages = definition({
      Render: { Type: 'Task', Resource: 'custom:invoice_pdf:2', Arguments: { number: '1', store: { configuration: 'archive' } }, Assign: { invoice: '{% $states.result %}' }, Next: 'Again' },
      Again: { Type: 'Task', Resource: 'custom:invoice_pdf:2', Arguments: { number: '{% $invoice.pages %}', store: { configuration: 'archive' } }, End: true },
    })
    expect(await problems(await save('bob', pages))).toEqual([{ state: 'Again', field: 'Arguments.number', message: 'reads $invoice.pages, a whole number, where number takes text' }])
    expect((await problems(await save('eve', render('custom:invoice_pdf:1'))))[0]).toMatchObject({ state: 'Render', field: 'Resource', message: expect.stringContaining('"custom:invoice_pdf:1" is not a step type') })
  })

  it("queues a run's custom step as a job for its tenant's runners, of the version it names, and waits", async () => {
    const [{ id: workflow }] = (await sql<{ id: string }>`select id from workflows.workflows where name = 'Invoices'`.execute(db)).rows as [{ id: string }]
    const run = String((await created('bob', '/workflow_runs', { workflow_id: workflow, input: { number: '1' } })).id)
    const jobs = async () => (await sql<{ step: string; state: string; status: string; tenant_id: string; version: number; input: unknown }>`select j.step, j.state, j.status, j.tenant_id, v.version, j.input
      from workflows.custom_step_jobs j join workflows.custom_step_versions v on v.id = j.version_id where j.run_id = ${run}`.execute(db)).rows
    await vi.waitFor(async () => expect(await jobs()).toHaveLength(1), { timeout: 20_000, interval: 50 })
    expect(await jobs()).toEqual([{ step: 'custom:invoice_pdf:1', state: 'Render', status: 'queued', tenant_id: '1', version: 1, input: { number: '1', store: { configuration: 'archive' } } }])
    // The segment queues the job before it records the run as waiting
    await vi.waitFor(async () => expect((await sql<{ status: string }>`select status from workflows.runs where id = ${run}`.execute(db)).rows[0]!.status).toBe('waiting'), { timeout: 20_000, interval: 50 })
  })

  it('keeps a deleted custom step\'s versions, as no step types, and numbers a new one of its name after them', async () => {
    const step = await created('ada', '/workflow_custom_steps', { name: 'short_lived', ...manifest })
    const save = (version: number) => as('bob', '/workflows', { method: 'POST', body: { name: `Short lived ${version}`, ...definitionFields(render(`custom:short_lived:${version}`)) } })
    expect((await save(1)).status).toBe(201)
    expect((await as('ada', `/workflow_custom_steps/${String(step.id)}`, { method: 'DELETE' })).status).toBe(204)
    const kept = async () => (await sql<{ custom_step_id: string | null; version: number }>`select custom_step_id, version from workflows.custom_step_versions where name = 'short_lived' order by version`.execute(db)).rows
    expect(await kept()).toEqual([{ custom_step_id: null, version: 1 }])
    expect((await stepTypes('bob')).map((type) => type.id)).not.toContain('custom:short_lived:1')
    expect((await save(1)).status).toBe(400)
    // Made again, it goes on from version 2, so custom:short_lived:1 never names another manifest
    const again = await created('ada', '/workflow_custom_steps', { name: 'short_lived', ...manifest, label: 'Short lived again' })
    expect(again.version).toBe(2)
    expect((await stepTypes('bob')).filter((type) => type.id.startsWith('custom:short_lived:')).map((type) => [type.id, type.label])).toEqual([['custom:short_lived:2', 'Short lived again']])
    expect(await kept()).toEqual([{ custom_step_id: null, version: 1 }, { custom_step_id: again.id, version: 2 }])
    expect((await save(1)).status).toBe(400)
    expect((await save(2)).status).toBe(201)
  })

  it('refuses a re-create that numbered a version an update and a delete took meanwhile, as a 409 to send again, never reusing it', async () => {
    const step = await created('ada', '/workflow_custom_steps', { name: 'raced', ...manifest })
    // A re-create labelled Held waits after its trigger numbered its version, until the lock below is let go: the
    // overlap a slow write would have, held open so the update and the delete land in it.
    await pg.exec(`create function workflows.hold_custom_step() returns trigger language plpgsql as $$ begin perform pg_advisory_xact_lock_shared(4242); return new; end $$;
      create trigger custom_step_version_held before insert on workflows.custom_steps for each row when (new.label = 'Held') execute function workflows.hold_custom_step()`)
    const holder = await pg.pool({ max: 1 }).connect()
    await holder.query('begin; select pg_advisory_xact_lock(4242)')
    const recreate = as('ada', '/workflow_custom_steps', { method: 'POST', body: { name: 'raced', ...manifest, label: 'Held' } })
    const held = async () => (await sql<{ count: number }>`select count(*)::int as count from pg_locks where locktype = 'advisory' and not granted`.execute(db)).rows[0]!.count
    await vi.waitFor(async () => expect(await held()).toBe(1), { timeout: 10_000, interval: 20 })
    expect((await as('ada', `/workflow_custom_steps/${String(step.id)}`, { method: 'PATCH', body: { label: 'Raced again' } })).status).toBe(200)
    expect((await as('ada', `/workflow_custom_steps/${String(step.id)}`, { method: 'DELETE' })).status).toBe(204)
    await holder.query('commit')
    holder.release()
    const refused = await recreate
    await pg.exec('drop trigger custom_step_version_held on workflows.custom_steps; drop function workflows.hold_custom_step()')

    expect(refused.status).toBe(409)
    expect(await refused.json()).toMatchObject({ detail: 'The custom step was saved at the same time as another write of its name, which took its version; send it again' })
    const kept = async () => (await sql<{ custom_step_id: string | null; version: number; label: string }>`select custom_step_id, version, label from workflows.custom_step_versions where name = 'raced' order by version`.execute(db)).rows
    expect(await kept()).toEqual([{ custom_step_id: null, version: 1, label: 'Invoice PDF' }, { custom_step_id: null, version: 2, label: 'Raced again' }])
    // Sent again, it goes on after the version the update took
    const again = await created('ada', '/workflow_custom_steps', { name: 'raced', ...manifest, label: 'Raced anew' })
    expect(again.version).toBe(3)
    expect((await kept()).map((row) => row.version)).toEqual([1, 2, 3])
  })
})
