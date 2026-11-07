import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { sql, type Kysely } from 'kysely'
// Where runs keep their traces.
const trace = await traceFiles()

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { defineRoles, f, resource } from '@protobase/schema'
import { configExports, createAdmin, startJobs, unauthorized, workflowsMigration, type JobsRuntime, type MailMessage, type WorkflowsOptions } from '@protobase/server'
import { workflowsModule } from '@protobase/server/internal'
import type { Plugin } from '@protobase/workflows/plugin'
import { openPostgresDatabase, postgresTemplateReady, type PostgresDatabase } from '../../test-support/postgres-database'
import { traceFiles } from './support/run-trace'

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

const secret = 'replay-secret-value-5c1f'
process.env.REPLAY_TOKEN = secret
// The cache keeps fingerprints of the secrets a result's input named only under an app secret.
process.env.PROTOBASE_SECRET = 'app-secret-for-the-replay-test'

const notes = resource('notes').table('notes').fields({ id: f.integer().readOnly(), text: f.text() }).primaryKey((r) => r.id)
const roles = defineRoles<'workflows' | 'workflow_versions' | 'workflow_runs' | 'notes'>({
  builder: ['workflows.*', 'workflow_versions.read', 'workflow_runs.*', 'notes.*'],
  // Reads the runs but not their traces, which a replay copies.
  runner: ['workflows.read', 'workflow_runs.create', { 'workflow_runs.read': ['id', 'workflow_id', 'status', 'rerun_of', 'created_at'] }],
  reader: ['workflows.read', 'workflow_runs.read'],
})
const people: Record<string, { tenant: string; roles: string[] }> = {
  ada: { tenant: '1', roles: ['builder'] },
  bob: { tenant: '2', roles: ['builder'] },
  rita: { tenant: '1', roles: ['runner'] },
  reed: { tenant: '1', roles: ['reader'] },
}

// A price lookup that reads and keeps its result an hour, and a step that says nothing of writing.
const lookups: unknown[] = []
const notified: unknown[] = []
const plugin: Plugin = {
  name: 'acme',
  label: 'Acme',
  steps: {
    price: {
      label: 'Price',
      description: 'Looks a price up.',
      input: { type: 'object' },
      writes: false,
      cache: { choice: 'hidden', ttl: '1 hour' },
      // It signs its request with the token, which puts the secret's name in the key.
      run: async ({ input }) => (lookups.push(input), { sku: input.sku, signed: typeof input.token === 'string', amount: 10 + lookups.length }),
    },
    notify: {
      label: 'Notify',
      description: 'Tells someone.',
      input: { type: 'object' },
      run: async ({ input }) => (notified.push(input), { told: true }),
    },
  },
}

const workflows: WorkflowsOptions = {
  allowPrivateAddresses: true,
  secrets: ['REPLAY_TOKEN'],
  plugins: [{ plugin, source: 'acme' }],
  savedByRoles: async ({ id, tenant }) => (people[id]?.tenant === tenant ? people[id]!.roles : []),
}

describe.skipIf(!(await postgresTemplateReady('jobs')))('replaying a run on the app\'s database and jobs', () => {
  let pg: PostgresDatabase
  let db: Kysely<any>
  let admin: ReturnType<typeof createAdmin>
  let runtime: JobsRuntime | undefined
  let receiver: Server
  let base: string
  const received: string[] = []
  const sent: MailMessage[] = []
  const errors: unknown[] = []

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
    admin = createAdmin({ resources, views, db, files: trace.files, authenticate, workflows, options: { roles } })
    receiver = createServer((request, response) => {
      received.push(`${request.method} ${request.url}`)
      response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ stock: 3 }))
    })
    await new Promise<void>((resolve) => receiver.listen(0, '127.0.0.1', resolve))
    base = `http://127.0.0.1:${(receiver.address() as AddressInfo).port}`
    runtime = await startJobs({ db, jobs: admin.jobs, pollSeconds: 0.5, shutdownSeconds: 5, mailer: { send: async (message) => void sent.push(message) }, onError: (error) => errors.push(error) })
  })

  afterAll(async () => {
    await trace.folder.remove()
    await runtime?.stop()
    await new Promise((resolve) => receiver?.close(resolve))
    await pg?.close()
    expect(errors).toEqual([])
  })

  const as = (user: string, path: string, init: { method?: string; body?: unknown } = {}) =>
    admin.request(`/api/v1${path}`, { method: init.method ?? 'GET', headers: { 'content-type': 'application/json', 'x-user': user, 'if-match': '*' }, ...(init.body !== undefined && { body: JSON.stringify(init.body) }) })
  const created = async (response: Response) => {
    if (response.status !== 201) throw new Error(await response.text())
    return (await response.json()).id as string
  }
  const count = async () => (await sql<{ count: number }>`select count(*)::int as count from workflows.runs`.execute(db)).rows[0]!.count
  const runRow = async (id: string) => (await sql<{ status: string; output: unknown; version: number; error: string | null }>`select status, output, version, error from workflows.runs where id = ${id}`.execute(db)).rows[0]!
  const finished = (id: string) => vi.waitFor(async () => expect(['succeeded', 'failed']).toContain((await runRow(id)).status), { timeout: 20_000, interval: 50 })
  const stepsOf = async (id: string) =>
    (await trace.steps(db, id)).map(({ state, input, output, logs, resumeAt }) => ({ state, input, output, logs, resume_at: (resumeAt as string | null | undefined) ?? null }))
  const byState = async (id: string) => Object.fromEntries((await stepsOf(id)).map((step) => [step.state, step]))

  // Reads a price and stock, composes a mail from them, then writes: mail, a record, a record update, a POST, a DELETE,
  // and a step that says nothing of writing. The Wait shows a replay does not wait.
  const order = (greeting: string, stock = '/stock') => ({
    trigger: { manual: {} },
    stateMachine: {
      QueryLanguage: 'JSONata',
      StartAt: 'Price',
      States: {
        Price: { Type: 'Task', Resource: 'acme:price', Arguments: { sku: '{% $states.context.Execution.Input.sku %}', token: '{% $states.context.Secrets.REPLAY_TOKEN %}' }, Assign: { amount: '{% $states.result.amount %}' }, Next: 'Stock' },
        Stock: { Type: 'Task', Resource: 'app:http', Arguments: { url: `${base}${stock}` }, Assign: { stock: '{% $states.result.body.stock %}' }, Next: 'Compose' },
        Compose: { Type: 'Pass', Assign: { text: `{% "${greeting}: " & $string($amount) & " EUR, " & $string($stock) & " left" %}` }, Next: 'Pause' },
        Pause: { Type: 'Wait', Seconds: 1, Next: 'Mail' },
        Mail: { Type: 'Task', Resource: 'app:mail.send', Arguments: { to: 'buyer@example.com', subject: 'Your order', text: '{% $text %}' }, Next: 'Note' },
        Note: { Type: 'Task', Resource: 'app:records.create', Arguments: { resource: 'notes', data: { text: 'mailed' } }, Assign: { note: '{% $states.result.id %}' }, Next: 'Edit' },
        Edit: { Type: 'Task', Resource: 'app:records.update', Arguments: { resource: 'notes', key: '{% $note %}', data: { text: 'mailed twice?' } }, Next: 'Post' },
        Post: { Type: 'Task', Resource: 'app:http', Arguments: { url: `${base}/orders`, method: 'POST', body: { sku: 'A1' } }, Next: 'Delete' },
        Delete: { Type: 'Task', Resource: 'app:http', Arguments: { url: `${base}/carts/1`, method: 'DELETE' }, Next: 'Notify' },
        Notify: { Type: 'Task', Resource: 'acme:notify', Arguments: { who: 'ops' }, End: true },
      },
    },
  })

  const ranOrder = async (user = 'ada') => {
    const workflow = await created(await as(user, '/workflows', { method: 'POST', body: { name: 'Order', definition: order('Hello') } }))
    const run = await created(await as(user, '/workflow_runs', { method: 'POST', body: { workflow_id: workflow, input: { sku: 'A1' } } }))
    await finished(run)
    expect(await runRow(run)).toMatchObject({ status: 'succeeded' })
    return { workflow, run }
  }

  it('runs the version saved since, sending none of the outside writes, which give what they gave, serving the unchanged read from the cache and reading a changed one live', async () => {
    const { workflow, run } = await ranOrder()
    const original = await byState(run)
    const before = { sent: sent.length, received: [...received], notified: notified.length, lookups: lookups.length, notes: (await sql`select id, text from notes`.execute(db)).rows }
    // The secret the price lookup was given changes since its result was kept, as a new value's fingerprint would.
    await sql`update workflows.step_cache set secrets = jsonb_set(secrets, '{REPLAY_TOKEN}', '"an-older-fingerprint"') where secrets ? 'REPLAY_TOKEN'`.execute(db)
    // The fix: a later version that greets otherwise and reads the stock of another warehouse.
    await as('ada', `/workflows/${workflow}`, { method: 'PATCH', body: { definition: order('Bye', '/stock?warehouse=2') } })
    const current = (await sql<{ version: number }>`select version from workflows.workflows where id = ${workflow}`.execute(db)).rows[0]!.version
    expect(current).toBe((await runRow(run)).version + 1)

    const replay = await created(await as('ada', '/workflow_runs', { method: 'POST', body: { workflow_id: workflow, rerun_of: run, replay: true } }))
    await finished(replay)
    expect(await runRow(replay)).toMatchObject({ status: 'succeeded', version: current })
    expect(sent).toHaveLength(before.sent)
    expect(notified).toHaveLength(before.notified)
    expect(lookups).toHaveLength(before.lookups)
    expect(received).toEqual([...before.received, 'GET /stock?warehouse=2'])
    expect((await sql`select id, text from notes`.execute(db)).rows).toEqual(before.notes)

    const steps = await byState(replay)
    expect(steps.Price!.output).toEqual(original.Price!.output)
    expect(steps.Price!.logs.map((log) => log.message).join('\n')).toContain('An earlier result from')
    expect(steps.Price!.logs.map((log) => log.message)).toContain('The secret REPLAY_TOKEN changed since that result was kept')
    expect(steps.Pause!.resume_at).toBeNull()
    for (const state of ['Mail', 'Note', 'Edit', 'Post', 'Delete', 'Notify']) {
      expect(steps[state]!.output).toEqual(original[state]!.output)
      expect(steps[state]!.logs.map((log) => log.message)).toEqual(['Not sent: replay'])
    }
    expect(steps.Mail!.input).toEqual({ to: 'buyer@example.com', subject: 'Your order', text: 'Bye: 11 EUR, 3 left' })
    const kept = JSON.stringify([await stepsOf(replay), await runRow(replay)])
    expect(kept).not.toContain(secret)
  })

  it('refuses a caller who may not read the trace or start runs, another tenant, and a run that is not one of the workflow', async () => {
    const { workflow, run } = await ranOrder()
    const other = await created(await as('ada', '/workflows', { method: 'POST', body: { name: 'Other', definition: order('Hi') } }))
    const runs = await count()
    const replay = (user: string, body: Record<string, unknown>) => as(user, '/workflow_runs', { method: 'POST', body: { replay: true, ...body } })
    expect((await replay('rita', { workflow_id: workflow, rerun_of: run })).status).toBe(404)
    expect([403, 404]).toContain((await replay('reed', { workflow_id: workflow, rerun_of: run })).status)
    expect((await replay('bob', { workflow_id: workflow, rerun_of: run })).status).toBe(409)
    expect((await replay('ada', { workflow_id: other, rerun_of: run })).status).toBe(409)
    expect((await replay('ada', { workflow_id: workflow, rerun_of: crypto.randomUUID() })).status).toBe(409)
    expect((await replay('ada', { workflow_id: workflow, rerun_of: workflow })).status).toBe(409)
    expect((await replay('ada', { workflow_id: workflow, rerun_of: 'not-a-run' })).status).toBe(400)
    expect((await replay('ada', { workflow_id: workflow })).status).toBe(400)
    expect((await replay('ada', { workflow_id: workflow, rerun_of: run, input: { sku: 'B2' } })).status).toBe(400)
    expect(await count()).toBe(runs)
  })

  it("serves a tenant's replay only from its own tenant's cache", async () => {
    await ranOrder('ada')
    const { workflow, run } = await ranOrder('bob')
    const own = (await byState(run)).Price!.output
    const replay = await created(await as('bob', '/workflow_runs', { method: 'POST', body: { workflow_id: workflow, rerun_of: run, replay: true } }))
    await finished(replay)
    expect((await byState(replay)).Price!.output).toEqual(own)
  })

  it('refuses to replay a run that has not ended', async () => {
    const waits = { trigger: { manual: {} }, stateMachine: { QueryLanguage: 'JSONata', StartAt: 'Hold', States: { Hold: { Type: 'Wait', Seconds: 3600, Next: 'Done' }, Done: { Type: 'Succeed' } } } }
    const workflow = await created(await as('ada', '/workflows', { method: 'POST', body: { name: 'Waits', definition: waits } }))
    const run = await created(await as('ada', '/workflow_runs', { method: 'POST', body: { workflow_id: workflow, input: {} } }))
    await vi.waitFor(async () => expect((await runRow(run)).status).toBe('waiting'), { timeout: 20_000, interval: 50 })
    const response = await as('ada', '/workflow_runs', { method: 'POST', body: { workflow_id: workflow, rerun_of: run, replay: true } })
    expect([response.status, (await response.json()).type]).toEqual([400, expect.stringContaining('run-not-ended')])
  })
})
