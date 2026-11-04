import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { sql, type Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { defineRoles, f, resource } from '@protobase/schema'
import { configExports, createAdmin, startJobs, unauthorized, workflowsMigration, type JobsRuntime, type WorkflowsOptions } from '@protobase/server'
import { workflowsModule } from '@protobase/server/internal'
import { openPostgresDatabase, postgresTemplateReady, type PostgresDatabase } from '../../test-support/postgres-database'

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

const secret = 'wf-access-secret-7d2e91'
process.env.WF_ACCESS_TOKEN = secret

const notes = resource('notes').table('notes').fields({ id: f.integer().readOnly(), text: f.text() }).primaryKey((r) => r.id)
const roles = defineRoles<'workflows' | 'workflow_versions' | 'workflow_runs' | 'workflow_steps' | 'notes'>({
  builder: ['workflows.*', 'workflow_versions.read', 'workflow_runs.*', 'workflow_steps.read', 'notes.*'],
  runner: ['workflows.read', 'workflow_runs.create', 'workflow_runs.read'],
  blind: ['workflow_runs.create', 'workflow_runs.read'],
  starter: ['workflows.read', 'workflow_runs.create'],
  reader: ['workflows.read', 'workflow_runs.read', 'workflow_steps.read'],
})
// Who holds which role in which tenant; a test takes a role away by changing it.
const people: Record<string, { tenant: string; roles: string[] }> = {
  ada: { tenant: '1', roles: ['builder'] },
  bob: { tenant: '2', roles: ['builder'] },
  rita: { tenant: '1', roles: ['runner'] },
  bella: { tenant: '1', roles: ['blind'] },
  stan: { tenant: '1', roles: ['starter'] },
  reed: { tenant: '1', roles: ['reader'] },
}
const workflows: WorkflowsOptions = {
  allowPrivateAddresses: true,
  secrets: ['WF_ACCESS_TOKEN'],
  savedByRoles: async ({ id, tenant }) => (people[id]?.tenant === tenant ? people[id]!.roles : []),
}
const definition = (states: Record<string, unknown>) => ({ trigger: { manual: {} }, stateMachine: { QueryLanguage: 'JSONata', StartAt: Object.keys(states)[0], States: states } })

describe.skipIf(!(await postgresTemplateReady('jobs')))('who may run workflows and read their runs, and what runs keep of secrets', () => {
  let pg: PostgresDatabase
  let db: Kysely<any>
  let admin: ReturnType<typeof createAdmin>
  let runtime: JobsRuntime
  let receiver: Server
  let base: string
  const authorizations: string[] = []

  beforeAll(async () => {
    pg = await openPostgresDatabase('jobs')
    db = pg.db
    await pg.exec((await workflowsMigration(db, workflows))!)
    await pg.exec('create table notes (id integer generated always as identity primary key, text text not null)')
    const { resources, views } = configExports({ ...workflowsModule(workflows), notes })
    const authenticate = (request: Request) => {
      const person = people[request.headers.get('x-user') ?? '']
      if (!person) throw unauthorized('Sign in first')
      return { user: { id: request.headers.get('x-user')!, roles: person.roles }, tenant: person.tenant }
    }
    admin = createAdmin({ resources, views, db, authenticate, workflows, options: { roles } })
    receiver = createServer((request, response) => {
      authorizations.push(request.headers.authorization ?? '')
      response.writeHead(500, { 'content-type': 'text/plain' }).end(`denied for ${request.headers.authorization}`)
    })
    await new Promise<void>((resolve) => receiver.listen(0, '127.0.0.1', resolve))
    base = `http://127.0.0.1:${(receiver.address() as AddressInfo).port}`
    runtime = await startJobs({ db, jobs: admin.jobs, pollSeconds: 0.5, shutdownSeconds: 5, onError: (error) => { throw error } })
  })

  afterAll(async () => {
    await runtime?.stop()
    await new Promise((resolve) => receiver?.close(resolve))
    await pg?.close()
  })

  const as = (user: string | undefined, path: string, init: { method?: string; body?: unknown } = {}) =>
    admin.request(`/api/v1${path}`, {
      method: init.method ?? 'GET',
      headers: { 'content-type': 'application/json', 'if-match': '*', ...(user && { 'x-user': user }) },
      ...(init.body !== undefined && { body: JSON.stringify(init.body) }),
    })
  const created = async (response: Response) => {
    if (response.status !== 201) throw new Error(await response.text())
    return (await response.json()).id as string
  }
  const count = async (table: string) => (await sql<{ count: number }>`select count(*)::int as count from ${sql.raw(table)}`.execute(db)).rows[0]!.count
  const runRow = async (id: string) => (await sql<{ status: string; error: string | null; cause: string | null }>`select status, error, cause from workflows.runs where id = ${id}`.execute(db)).rows[0]!
  const finished = (id: string) => vi.waitFor(async () => expect(['succeeded', 'failed']).toContain((await runRow(id)).status), { timeout: 20_000, interval: 50 })
  const echo = () => definition({ Echo: { Type: 'Succeed', Output: '{% {"echo": $states.context.Execution.Input} %}' } })

  it("keeps a tenant's runs and workflows from another tenant: no reading, starting or editing them", async () => {
    const workflow = await created(await as('ada', '/workflows', { method: 'POST', body: { name: 'Mine', definition: echo() } }))
    const run = await created(await as('ada', '/workflow_runs', { method: 'POST', body: { workflow_id: workflow, input: { card: 'private-input-31' } } }))
    await finished(run)
    for (const path of [`/workflow_runs/${run}`, `/workflow_steps?filter=${encodeURIComponent(`run_id = "${run}"`)}`, `/workflows/${workflow}`]) {
      const response = await as('bob', path)
      expect(await response.text()).not.toContain('private-input-31')
      if (!path.startsWith('/workflow_steps')) expect(response.status).toBe(404)
    }
    const [runs, versions] = [await count('workflows.runs'), await count('workflows.versions')]
    const start = await as('bob', '/workflow_runs', { method: 'POST', body: { workflow_id: workflow, input: {} } })
    const missing = await as('bob', '/workflow_runs', { method: 'POST', body: { workflow_id: crypto.randomUUID(), input: {} } })
    // Refused as a workflow that is not there: the same answer as for an id no tenant has.
    expect([start.status, (await start.json()).detail.replace(workflow, '<id>')]).toEqual([missing.status, (await missing.json()).detail.replace(/[0-9a-f-]{36}/, '<id>')])
    expect(start.status).toBe(409)
    expect((await as('bob', `/workflows/${workflow}`, { method: 'PATCH', body: { definition: definition({ Other: { Type: 'Succeed' } }) } })).status).toBe(404)
    expect([await count('workflows.runs'), await count('workflows.versions')]).toEqual([runs, versions])
  })

  it('starts runs only for a caller who may start and read them and read the workflow, and shows steps only to their readers', async () => {
    const workflow = await created(await as('ada', '/workflows', { method: 'POST', body: { name: 'Split', definition: echo() } }))
    const runs = await count('workflows.runs')
    expect([403, 404]).toContain((await as('reed', '/workflow_runs', { method: 'POST', body: { workflow_id: workflow, input: {} } })).status)
    expect((await as('bella', '/workflow_runs', { method: 'POST', body: { workflow_id: workflow, input: {} } })).status).toBe(404)
    // The API writes only the fields a caller reads, so the start grant alone starts nothing.
    expect((await as('stan', '/workflow_runs', { method: 'POST', body: { workflow_id: workflow, input: {} } })).status).toBe(400)
    expect(await count('workflows.runs')).toBe(runs)
    const run = await created(await as('rita', '/workflow_runs', { method: 'POST', body: { workflow_id: workflow, input: { from: 'rita' } } }))
    await finished(run)
    expect((await as('rita', `/workflow_runs/${run}`)).status).toBe(200)
    expect([403, 404]).toContain((await as('rita', `/workflow_steps?filter=${encodeURIComponent(`run_id = "${run}"`)}`)).status)
    expect([403, 404]).toContain((await as('stan', `/workflow_runs/${run}`)).status)
    expect((await as('reed', `/workflow_runs/${run}`)).status).toBe(200)
  })

  it('refuses a run with no caller, or with an input too large or too deep, creating no run', async () => {
    const workflow = await created(await as('ada', '/workflows', { method: 'POST', body: { name: 'Limits', definition: echo() } }))
    const runs = await count('workflows.runs')
    expect((await as(undefined, '/workflow_runs', { method: 'POST', body: { workflow_id: workflow, input: {} } })).status).toBe(401)
    const large = await as('ada', '/workflow_runs', { method: 'POST', body: { workflow_id: workflow, input: { text: 'x'.repeat(1024 * 1024) } } })
    expect([large.status, (await large.json()).type]).toEqual([400, expect.stringContaining('input-too-large')])
    // Written as text: a value 100,000 levels deep is deeper than JSON.stringify walks.
    for (const levels of [65, 100_000]) {
      const body = `{"workflow_id": "${workflow}", "input": ${'['.repeat(levels)}1${']'.repeat(levels)}}`
      const nested = await admin.request('/api/v1/workflow_runs', { method: 'POST', headers: { 'content-type': 'application/json', 'x-user': 'ada' }, body })
      expect([nested.status, (await nested.json()).type]).toEqual([400, expect.stringContaining('input-too-deep')])
    }
    expect(await count('workflows.runs')).toBe(runs)
  })

  it("acts on records as the workflow's last editor with the roles they hold now, whoever starts the run", async () => {
    const workflow = await created(await as('ada', '/workflows', {
      method: 'POST',
      body: { name: 'Note', definition: definition({ Write: { Type: 'Task', Resource: 'app:records.create', Arguments: { resource: 'notes', data: { text: '{% $states.context.Execution.Input.text %}' } }, End: true } }) },
    }))
    // Rita may not write notes herself, but the run writes as Ada, who saved the workflow.
    expect([403, 404]).toContain((await as('rita', '/notes', { method: 'POST', body: { text: 'direct' } })).status)
    const run = await created(await as('rita', '/workflow_runs', { method: 'POST', body: { workflow_id: workflow, input: { text: 'through the run' } } }))
    await finished(run)
    expect(await runRow(run)).toEqual({ status: 'succeeded', error: null, cause: null })
    expect((await sql`select text from notes`.execute(db)).rows).toEqual([{ text: 'through the run' }])

    people.ada = { tenant: '1', roles: [] }
    const after = await created(await as('rita', '/workflow_runs', { method: 'POST', body: { workflow_id: workflow, input: { text: 'after the role went' } } }))
    await finished(after)
    people.ada = { tenant: '1', roles: ['builder'] }
    expect(await runRow(after)).toEqual({ status: 'failed', error: 'Records.Refused', cause: "The workflow's last editor holds no role here any more, so its steps act on no records" })
    expect(await count('notes')).toBe(1)
  })

  it('sends a secret where the workflow puts it, and keeps it in no run, step or job, across a wait and on failure', async () => {
    const workflow = await created(await as('ada', '/workflows', {
      method: 'POST',
      body: {
        name: 'Secret',
        definition: definition({
          Keep: { Type: 'Pass', Assign: { header: '{% "Bearer " & $states.context.Secrets.WF_ACCESS_TOKEN %}' }, Next: 'Pause' },
          Pause: { Type: 'Wait', Seconds: 1, Next: 'Call' },
          Call: {
            Type: 'Task',
            Resource: 'app:http',
            Arguments: { url: `{% "${base}/hook?key=" & $states.context.Secrets.WF_ACCESS_TOKEN %}`, headers: { Authorization: '{% "Bearer " & $states.context.Secrets.WF_ACCESS_TOKEN %}', 'X-Kept': '{% $header %}' } },
            Catch: [{ ErrorEquals: ['States.ALL'], Assign: { failure: '{% $states.errorOutput %}' }, Next: 'Report' }],
            End: true,
          },
          Report: { Type: 'Fail', Error: 'Reported', Cause: '{% $failure.Cause & " / " & $states.context.Secrets.WF_ACCESS_TOKEN %}' },
        }),
      },
    }))
    const run = await created(await as('ada', '/workflow_runs', { method: 'POST', body: { workflow_id: workflow, input: {} } }))
    await finished(run)
    expect(authorizations).toEqual([`Bearer ${secret}`])
    expect((await runRow(run)).error).toBe('Reported')
    const kept = await sql<{ text: string }>`select (select coalesce(json_agg(r), '[]')::text from workflows.runs r) || (select coalesce(json_agg(s), '[]')::text from workflows.steps s) || (select coalesce(json_agg(j.data), '[]')::text || coalesce(json_agg(j.output), '[]')::text from jobs.job j) as text`.execute(db)
    expect(kept.rows[0]!.text).toContain('[redacted]')
    expect(kept.rows[0]!.text).not.toContain(secret)
  })
})
