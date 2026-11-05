import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { sql, type Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { defineRoles, f, resource } from '@protobase/schema'
import { configExports, createAdmin, startJobs, workflowsMigration, type JobsRuntime, type MailMessage, type WorkflowsOptions } from '@protobase/server'
import { localFiles, workflowsModule } from '@protobase/server/internal'
import a from '../../packages/workflows/src/reference/a.json'
import c from '../../packages/workflows/src/reference/c.json'
import d from '../../packages/workflows/src/reference/d.json'
import g from '../../packages/workflows/src/reference/g.json'
import { tempDir } from '../../packages/server/src/files/testing/temp-dir'
import { openPostgresDatabase, postgresTemplateReady, type PostgresDatabase } from '../../test-support/postgres-database'

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

// The report's flows as it gives them, their outside hosts pointed at a local receiver.
const pointedAt = (flow: unknown, base: string) => JSON.parse(JSON.stringify(flow).replace(/https:\/\/(api|payments|reports)\.example\.com/g, `${base}/$1`))

const app = [
  resource('leads').table('leads').fields({ id: f.integer().readOnly(), name: f.text(), email: f.text(), company: f.text(), notes: f.text().optional(), received_at: f.timestamp() }).primaryKey((r) => r.id),
  resource('products').table('products').fields({ id: f.integer().readOnly(), sku: f.text(), name: f.text(), price: f.decimal({ precision: 10, scale: 2 }), currency: f.text() }).primaryKey((r) => r.id),
  resource('orders').table('orders').fields({ id: f.integer().readOnly(), customer_email: f.text(), total: f.decimal({ precision: 10, scale: 2 }), status: f.text().optional() }).primaryKey((r) => r.id),
  resource('reports').table('reports').fields({ id: f.integer().readOnly(), title: f.text(), pdf: f.file() }).primaryKey((r) => r.id),
]
const roles = defineRoles<'workflows' | 'workflow_versions' | 'workflow_runs' | 'workflow_steps' | 'leads' | 'products' | 'orders' | 'reports'>({
  builder: ['workflows.*', 'workflow_versions.read', 'workflow_runs.*', 'workflow_steps.read', 'leads.*', 'products.*', 'orders.*', 'reports.*'],
})
const workflows: WorkflowsOptions = { allowPrivateAddresses: true, savedByRoles: async () => ['builder'] }

describe.skipIf(!(await postgresTemplateReady('jobs')))("the report's reference flows on the app's database and jobs", () => {
  let pg: PostgresDatabase
  let db: Kysely<any>
  let admin: ReturnType<typeof createAdmin>
  let runtime: JobsRuntime
  let receiver: Server
  let base: string
  let folder: Awaited<ReturnType<typeof tempDir>>
  let chargeStatus = 200
  const received: { method?: string; url?: string; body: string }[] = []
  const sent: MailMessage[] = []
  const errors: unknown[] = []

  beforeAll(async () => {
    pg = await openPostgresDatabase('jobs')
    db = pg.db
    folder = await tempDir()
    await pg.exec((await workflowsMigration(db, workflows))!)
    await pg.exec(`create table leads (id integer generated always as identity primary key, name text not null, email text not null, company text not null, notes text, received_at timestamptz not null);
      create table products (id integer generated always as identity primary key, sku text not null, name text not null, price numeric(10,2) not null, currency text not null);
      create table orders (id integer generated always as identity primary key, customer_email text not null, total numeric(10,2) not null, status text);
      create table reports (id integer generated always as identity primary key, title text not null, pdf text not null);
      insert into orders (customer_email, total) values ('c@example.com', 99.50), ('d@example.com', 12.00)`)
    const { resources, views } = configExports({ ...workflowsModule(workflows), ...Object.fromEntries(app.map((source) => [source.toModel().name, source])) })
    const files = { providers: { private: localFiles({ dir: folder.dir }) }, secret: 'files-secret-for-the-reference-flows' }
    admin = createAdmin({ resources, views, db, files, authenticate: () => ({ user: { id: 'ada', roles: ['builder'] }, tenant: '1' }), workflows, options: { roles } })
    receiver = createServer((request, response) => {
      const chunks: Buffer[] = []
      request.on('data', (chunk: Buffer) => chunks.push(chunk))
      request.on('end', () => {
        received.push({ method: request.method, url: request.url, body: Buffer.concat(chunks).toString() })
        const json = (status: number, value: unknown) => response.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(value))
        if (request.url?.startsWith('/api/v1/products?')) return json(200, { items: [{ sku: 'A1', name: 'Lamp' }, { sku: 'B2', name: 'Desk' }] })
        const price = /^\/api\/v1\/products\/(\w+)\/price$/.exec(request.url ?? '')
        if (price) return json(200, { amount: price[1] === 'A1' ? 12.5 : 80, currency: 'EUR' })
        if (request.url === '/payments/charges') return json(chargeStatus, chargeStatus === 200 ? { id: 'ch_1' } : { error: 'card declined' })
        if (request.url === '/reports/sales/latest.pdf') return response.writeHead(200, { 'content-type': 'application/pdf' }).end('%PDF-1.4 weekly sales')
        json(404, {})
      })
    })
    await new Promise<void>((resolve) => receiver.listen(0, '127.0.0.1', resolve))
    base = `http://127.0.0.1:${(receiver.address() as AddressInfo).port}`
    runtime = await startJobs({ db, jobs: admin.jobs, pollSeconds: 0.5, shutdownSeconds: 5, mailer: { send: async (message) => void sent.push(message) }, onError: (error) => errors.push(error) })
  })

  afterAll(async () => {
    await runtime?.stop()
    await new Promise((resolve) => receiver?.close(resolve))
    await pg?.close()
    await folder?.remove()
    expect(errors).toEqual([])
  })

  const post = async (path: string, body: unknown) => {
    const response = await admin.request(`/api/v1${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    if (response.status !== 201) throw new Error(await response.text())
    return (await response.json()).id as string
  }
  const runRow = async (id: string) => (await sql<{ status: string; error: string | null; cause: string | null }>`select status, error, cause from workflows.runs where id = ${id}`.execute(db)).rows[0]!
  const runFlow = async (name: string, flow: unknown, input: unknown) => {
    // Runs start by hand here: the flows' triggers are not what this test is about.
    const workflow = await post('/workflows', { name, definition: { ...pointedAt(flow, base), trigger: { manual: {} } } })
    const run = await post('/workflow_runs', { workflow_id: workflow, input })
    await vi.waitFor(async () => expect(['succeeded', 'failed']).toContain((await runRow(run)).status), { timeout: 20_000, interval: 50 })
    return run
  }

  it('a: a webhook POST becomes a lead', async () => {
    const body = { contact: { first_name: 'Ada', last_name: 'Lovelace', email: 'ADA@Example.com' }, company: { name: 'Analytical Engines' }, message: 'Please call me', submitted_at: '2026-10-30T09:15:00Z' }
    const run = await runFlow('a', a, { body, headers: {}, query: {} })
    expect(await runRow(run)).toMatchObject({ status: 'succeeded' })
    const { rows } = await sql`select name, email, company, notes, received_at from leads`.execute(db)
    expect(rows).toEqual([{ name: 'Ada Lovelace', email: 'ada@example.com', company: 'Analytical Engines', notes: 'Please call me', received_at: new Date('2026-10-30T09:15:00Z') }])
  })

  it('c: products updated since the day before, each priced, saved as records', async () => {
    const run = await runFlow('c', c, { scheduled_at: '2026-11-04T06:00:00+01:00' })
    expect(await runRow(run)).toEqual({ status: 'succeeded', error: null, cause: null })
    expect(received.find((request) => request.url?.startsWith('/api/v1/products?'))?.url).toBe('/api/v1/products?updated_since=2026-11-03')
    const { rows } = await sql`select sku, name, price, currency from products order by sku`.execute(db)
    expect(rows).toEqual([{ sku: 'A1', name: 'Lamp', price: '12.50', currency: 'EUR' }, { sku: 'B2', name: 'Desk', price: '80.00', currency: 'EUR' }])
  })

  it('d: a charge that goes through ends the run; one that keeps failing marks the order and mails ops the error', async () => {
    const order = { resource: 'orders', key: '1', record: { id: 1, customer_email: 'c@example.com', total: 99.5 } }
    expect(await runRow(await runFlow('d', d, order))).toMatchObject({ status: 'succeeded' })
    expect(received.filter((request) => request.url === '/payments/charges').map((request) => JSON.parse(request.body))).toEqual([{ order_id: 1, amount: 99.5 }])

    // The report's waits are 10, 20 and 40 seconds; this run waits 1 second for each retry, the flow being otherwise the same.
    chargeStatus = 502
    const quick = structuredClone(d) as typeof d
    quick.stateMachine.States.Charge.Retry = [{ ErrorEquals: ['States.ALL'], IntervalSeconds: 1, MaxAttempts: 3, BackoffRate: 1 }]
    const failing = await runFlow('d (quick retries)', quick, { ...order, key: '2', record: { id: 2, customer_email: 'd@example.com', total: 12 } })
    expect(await runRow(failing)).toMatchObject({ status: 'succeeded' })
    expect(received.filter((request) => request.url === '/payments/charges')).toHaveLength(5)
    expect((await sql`select id, status from orders order by id`.execute(db)).rows).toEqual([{ id: 1, status: null }, { id: 2, status: 'payment_failed' }])
    expect(sent.at(-1)).toMatchObject({ to: 'ops@example.com', subject: 'Payment failed for order 2', text: expect.stringMatching(/^127\.0\.0\.1:\d+ answered 502: \{"error":"card declined"\}$/) })
  })

  it('g: a downloaded file saved on a record and mailed with its size', async () => {
    const run = await runFlow('g', g, { scheduled_at: '2026-11-02T07:00:00+01:00' })
    expect(await runRow(run)).toMatchObject({ status: 'succeeded' })
    const { rows } = await sql<{ title: string; pdf: string }>`select title, pdf from reports`.execute(db)
    expect(rows).toEqual([{ title: 'Rapport des ventes — édition hebdomadaire', pdf: expect.stringMatching(new RegExp(`^private:workflows/${run}/[0-9a-f-]{36}\\?name=latest.pdf&size=21$`)) }])
    const mail = sent.at(-1)!
    expect(mail).toMatchObject({ to: 'finance@example.com', subject: 'Rapport des ventes', text: 'Bonjour, ci-joint le rapport des ventes (21 octets).' })
    expect(mail.attachments!.map(({ filename, content, contentType }) => [filename, new TextDecoder().decode(content), contentType])).toEqual([['latest.pdf', '%PDF-1.4 weekly sales', 'application/pdf']])
  })
})
