import { sql, Kysely } from 'kysely'
import { solveChallenge, type Challenge } from 'altcha-lib'
import { deriveKey } from 'altcha-lib/algorithms/web/sha'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { defineRoles, f, resource, view } from '@protobase/schema'
import { changesMigration, createAdmin, jobsSchemaMigration, startJobs, type JobsRuntime } from '@protobase/server'
import { openPostgresDatabase, postgresTemplateReady, type PostgresDatabase } from '../../test-support/postgres-database'
import { as, testAuthenticator } from '../../test-support/server'

// Workers poll on real timers, which a busy machine stretches.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

const requests = resource('contact_requests')
  .table('contact_requests')
  .fields({
    id: f.integer().readOnly().filterable().sortable(),
    name: f.text(),
    email: f.text().max(80),
    message: f.text().optional(),
    handled: f.boolean().default(false),
  })
  .primaryKey((r) => r.id)
  .validate((record) => (record.email?.includes('@') ? undefined : [{ field: 'email', message: 'Give an email address' }]))
  .history()

const products = resource('products').table('products').fields({ id: f.integer().readOnly(), name: f.text() }).primaryKey((r) => r.id)

const roles = defineRoles<'contact_requests' | 'products'>({
  admin: ['*'],
  anonymous: [{ 'products.read': ['name'] }, { 'contact_requests.create': ['name', 'email', 'message'] }],
})

const requestsView = view<typeof requests>('contact_requests')
  .fields((r) => ({ name: r.name.label('Your name'), handled: r.handled.label('Handled') }))
  .form((r) => ({ name: 'contact', title: 'Contact us', fields: [r.name, r.email, r.message], thanks: 'Thanks, we will reply within a day.' }))

// A shop's contact form: visitors send requests they cannot read back, behind a rate limit and a bot check.
describe.skipIf(!(await postgresTemplateReady('jobs')))('a public form through the API', () => {
  let pg: PostgresDatabase
  let db: Kysely<any>
  let app: ReturnType<typeof createAdmin>
  let runtime: JobsRuntime
  const errors: unknown[] = []

  beforeAll(async () => {
    vi.stubEnv('PROTOBASE_FORMS_SECRET', 'forms secret')
    pg = await openPostgresDatabase('jobs')
    db = pg.db
    const jobs = await jobsSchemaMigration(db)
    if (jobs) await pg.exec(jobs)
    await pg.exec(`
      create table contact_requests (id integer generated always as identity primary key, name text not null, email text not null, message text, handled boolean not null default false);
      create table products (id integer generated always as identity primary key, name text not null);
    `)
    await pg.exec((await changesMigration(db, [requests.toModel()]))!)
    app = createAdmin({ resources: [requests, products], views: [requestsView], db, authenticate: testAuthenticator, history: { days: 30 }, options: { roles }, formsDifficulty: { min: 1, max: 20 } })
    runtime = await startJobs({ db, jobs: app.jobs, pollSeconds: 0.5, shutdownSeconds: 5, onError: (error) => errors.push(error) })
  })
  afterAll(async () => {
    await runtime?.stop()
    await pg?.close()
    vi.unstubAllEnvs()
    expect(errors).toEqual([])
  })

  const proof = async (name = 'contact') => {
    const challenge = (await (await app.request(`/api/forms/${name}:challenge`)).json()) as Challenge
    return { challenge, solution: (await solveChallenge({ challenge, deriveKey }))! }
  }
  const send = async (values: Record<string, unknown>, options: { proof?: unknown; from?: string } = {}) =>
    app.request('/api/forms/contact', {
      method: 'POST',
      body: JSON.stringify({ values, proof: 'proof' in options ? options.proof : await proof() }),
      headers: { 'content-type': 'application/json', 'x-forwarded-for': options.from ?? '203.0.113.1' },
    })
  const stored = async () => (await sql<Record<string, unknown>>`select name, email, message, handled from contact_requests order by id`.execute(db)).rows

  it('describes the form with its fields alone, as /meta would give them', async () => {
    const response = await app.request('/api/forms/contact')
    expect(response.status).toBe(200)
    const body = (await response.json()) as { resource: { fields: Record<string, unknown> }; view: { fields: Record<string, unknown> } } & Record<string, unknown>
    expect(body).toMatchObject({ name: 'contact', title: 'Contact us', fields: ['name', 'email', 'message'], thanks: 'Thanks, we will reply within a day.' })
    expect(Object.keys(body.resource.fields).sort()).toEqual(['email', 'id', 'message', 'name'])
    expect(body.resource.fields.email).toMatchObject({ readOnly: false })
    expect(body.view.fields).toEqual({ name: { label: 'Your name' } })
    expect((await app.request('/api/forms/newsletter')).status).toBe(404)
    expect((await app.request('/api/forms/newsletter:challenge')).status).toBe(404)
  })

  it('creates the record from a solved check, and shows the visitor nothing of it', async () => {
    const response = await send({ name: 'Ada', email: 'ada@example.com', message: 'Do you ship to Utrecht?' })
    expect([response.status, await response.text()]).toEqual([204, ''])
    expect(await stored()).toEqual([{ name: 'Ada', email: 'ada@example.com', message: 'Do you ship to Utrecht?', handled: false }])
  })

  it('refuses a submission without a solved check, or with one already used', async () => {
    for (const bad of [undefined, 'proof', { challenge: {}, solution: {} }]) {
      const response = await send({ name: 'Bot', email: 'bot@example.com' }, { proof: bad, from: '203.0.113.2' })
      expect(response.status).toBe(400)
      expect(await response.json()).toMatchObject({ type: 'urn:protobase:problem:bot-check-failed' })
    }
    const used = await proof()
    expect((await send({ name: 'Bea', email: 'bea@example.com' }, { proof: used, from: '203.0.113.2' })).status).toBe(204)
    const again = await send({ name: 'Bea', email: 'bea@example.com' }, { proof: used, from: '203.0.113.2' })
    expect(again.status).toBe(400)
    expect((await again.json()).detail).toContain('already used')
    expect((await stored()).map((row) => row.name)).toEqual(['Ada', 'Bea'])
  })

  it('takes only the form fields, and answers the problems of a create on their fields', async () => {
    const unlisted = await send({ name: 'Eve', email: 'eve@example.com', handled: true }, { from: '203.0.113.3' })
    expect(unlisted.status).toBe(400)
    expect((await unlisted.json()).errors).toEqual([expect.objectContaining({ field: 'handled' })])
    const invalid = await send({ name: 'Eve', email: 'eve at example' }, { from: '203.0.113.3' })
    expect(invalid.status).toBe(400)
    expect((await invalid.json()).errors).toEqual([expect.objectContaining({ field: 'email', message: 'Give an email address' })])
    const missing = await send({ name: 'Eve' }, { from: '203.0.113.3' })
    expect((await missing.json()).errors).toEqual([expect.objectContaining({ field: 'email', code: 'required' })])
    expect(await stored()).toHaveLength(2)
  })

  it('refuses a client a sixth submission within a minute, but not another client', async () => {
    for (let i = 0; i < 5; i++) expect((await send({ name: `Spam ${i}`, email: 'spam@example.com' }, { from: '198.51.100.9' })).status).toBe(204)
    const refused = await send({ name: 'Spam 5', email: 'spam@example.com' }, { from: '198.51.100.9' })
    expect(refused.status).toBe(429)
    expect(Number(refused.headers.get('retry-after'))).toBeGreaterThan(0)
    expect(await refused.json()).toMatchObject({ type: 'urn:protobase:problem:too-many-submissions' })
    expect((await send({ name: 'Cy', email: 'cy@example.com' }, { from: '198.51.100.10' })).status).toBe(204)
  })

  it('keeps the create anywhere else from visitors: the API, batches and /meta', async () => {
    const body = JSON.stringify({ name: 'Mallory', email: 'm@example.com' })
    expect((await app.request('/api/v1/contact_requests', { method: 'POST', body, headers: { 'content-type': 'application/json' } })).status).toBe(404)
    const batch = JSON.stringify({ ops: [{ op: 'create', resource: 'contact_requests', data: { name: 'Mallory', email: 'm@example.com' } }] })
    expect((await app.request('/api/v1:batchWrite', { method: 'POST', body: batch, headers: { 'content-type': 'application/json' } })).status).toBe(401)
    const meta = (await (await app.request('/api/meta')).json()) as { resources: Array<{ name: string }>; views: Array<Record<string, unknown>> }
    expect(meta.resources.map((model) => model.name)).toEqual(['products'])
    const admin = (await (await app.request('/api/meta', { headers: as(undefined, 'admin') })).json()) as { views: Array<Record<string, unknown>> }
    expect(admin.views.find((item) => item.resource === 'contact_requests')).not.toHaveProperty('forms')
  })

  it('keeps each submission in the history, made by a visitor', async () => {
    const kept = async () => Number((await sql<{ count: string }>`select count(*)::text as count from changes.history`.execute(db)).rows[0]!.count)
    await vi.waitFor(async () => expect(await kept()).toBe((await stored()).length), { timeout: 15_000, interval: 25 })
    const response = await app.request('/api/v1/contact_requests/1:history', { headers: as(undefined, 'admin') })
    const { items } = (await response.json()) as { items: Array<Record<string, unknown>> }
    expect(items).toEqual([expect.objectContaining({ operation: 'create', actor: { id: '', name: 'Visitor' } })])
  })
})
