import { createHmac } from 'node:crypto'
import { sql, type Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { defineRoles } from '@protobase/schema'
import { configExports, createAdmin, startJobs, workflowsMigration, type JobsRuntime, type WorkflowsOptions } from '@protobase/server'
import { localFiles, workflowsModule } from '@protobase/server/internal'
import { definePlugin, webhookInputProperties } from '@protobase/workflows/plugin'
import { tempDir } from '../../packages/server/src/files/testing/temp-dir'
import { openPostgresDatabase, postgresTemplateReady, type PostgresDatabase } from '../../test-support/postgres-database'

// Workers poll on real timers, which a busy machine stretches.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

// A webhook type whose plugin fails on every call, and one subscribed at its provider, which a delete unsubscribes.
const unsubscribed: unknown[] = []
const fixtures = definePlugin({
  name: 'fixture',
  label: 'Fixture',
  triggers: {
    broken: { kind: 'webhook', label: 'Broken', description: 'Fails every call.', input: { type: 'object', properties: webhookInputProperties }, receive: async () => { throw new Error('the plugin broke') } },
    subscribed: {
      kind: 'webhook',
      label: 'Subscribed',
      description: 'Registers its URL itself.',
      input: { type: 'object', properties: webhookInputProperties },
      subscribe: async () => ({ subscription: 'sub-1' }),
      unsubscribe: async ({ state }) => void unsubscribed.push(state),
      receive: async ({ event }) => ({ items: [{ data: event }] }),
    },
  },
})

const roles = defineRoles<'workflows' | 'workflow_versions' | 'workflow_runs' | 'workflow_steps' | 'workflow_triggers'>({
  builder: ['workflows.*', 'workflow_versions.read', 'workflow_runs.*', 'workflow_steps.read', 'workflow_triggers.read'],
  reader: ['workflows.read', 'workflow_versions.read', 'workflow_runs.read', 'workflow_steps.read'],
})
const people: Record<string, { tenant: number; role: string }> = { ada: { tenant: 1, role: 'builder' }, bob: { tenant: 2, role: 'builder' }, rita: { tenant: 1, role: 'reader' } }
const workflows: WorkflowsOptions = { savedByRoles: async ({ id }) => [people[id]!.role], plugins: [{ plugin: fixtures, source: 'fixture' }] }

const until = async <T>(read: () => Promise<T>, done: (value: T) => boolean, ms = 15_000) => {
  const end = Date.now() + ms
  for (;;) {
    const value = await read()
    if (done(value) || Date.now() > end) return value
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
}

const sign = (secret: string, id: string, timestamp: number, body: string) =>
  `v1,${createHmac('sha256', Buffer.from(secret.replace(/^whsec_/, ''), 'base64')).update(`${id}.${timestamp}.${body}`).digest('base64')}`
const now = () => Math.floor(Date.now() / 1000)

describe.skipIf(!(await postgresTemplateReady('jobs')))('the webhook trigger and its public address', () => {
  let pg: PostgresDatabase
  let db: Kysely<any>
  let runtime: JobsRuntime
  let admin: ReturnType<typeof createAdmin>
  let folder: Awaited<ReturnType<typeof tempDir>>
  const reported: { error: unknown; request: Request | undefined }[] = []
  const logged: string[] = []

  beforeAll(async () => {
    pg = await openPostgresDatabase('jobs')
    db = pg.db
    folder = await tempDir()
    await pg.exec((await workflowsMigration(db, workflows))!)
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => void logged.push(args.map(String).join(' ')))
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => void logged.push(args.map(String).join(' ')))
    const { resources, views } = configExports({ ...workflowsModule(workflows) })
    admin = createAdmin({
      resources,
      views,
      db,
      files: { providers: { private: localFiles({ dir: folder.dir }) }, secret: 'files-secret-for-the-webhook-tests' },
      authenticate: (request) => {
        const id = request.headers.get('x-user')
        if (!id) throw Object.assign(new Error('no user'), { status: 401 })
        return { user: { id, roles: [people[id]!.role] }, tenant: people[id]!.tenant, organization: { id: people[id]!.tenant } }
      },
      workflows,
      options: { roles, onUnhandledError: (error, request) => void reported.push({ error, request }) },
    })
    runtime = await startJobs({ db, jobs: admin.jobs, pollSeconds: 0.5, shutdownSeconds: 5, onError: (error) => { throw error } })
  })

  afterAll(async () => {
    await runtime?.stop()
    await pg?.close()
    await folder?.remove()
  })

  const as = async (user: string, path: string, method = 'GET', body?: unknown) => {
    const response = await admin.request(path, { method, headers: { 'content-type': 'application/json', 'if-match': '*', 'x-user': user }, ...(body !== undefined && { body: JSON.stringify(body) }) })
    return { status: response.status, body: (await response.json().catch(() => null)) as Record<string, any> }
  }
  const echo = { QueryLanguage: 'JSONata', StartAt: 'Done', States: { Done: { Type: 'Pass', Output: '{% $states.context.Execution.Input %}', End: true } } }
  const save = async (user: string, trigger: unknown) => (await as(user, '/api/v1/workflows', 'POST', { name: 'Hook', definition: { trigger, stateMachine: echo } })).body as { id: string; version: number }
  const enable = (user: string, id: string, version: number | null) => as(user, `/api/v1/workflows/${id}`, 'PATCH', { enabled_version: version })
  const issue = (user: string, id: string, secret?: string) => as(user, `/api/workflows/${id}/webhook`, 'POST', secret === undefined ? undefined : { secret })
  // A workflow on `trigger`, turned on, with its URL issued.
  const hooked = async (trigger: Record<string, unknown> = {}, user = 'ada', type = 'app:webhook') => {
    const workflow = await save(user, { [type]: trigger })
    expect((await enable(user, workflow.id, 1)).status).toBe(200)
    const issued = await issue(user, workflow.id)
    expect(issued.status).toBe(200)
    return { id: workflow.id, url: new URL(issued.body.url).pathname, secret: issued.body.secret as string }
  }
  const call = (url: string, init: RequestInit & { from?: string } = {}) => {
    const headers = new Headers(init.headers)
    headers.set('x-forwarded-for', init.from ?? '203.0.113.1')
    return admin.request(url, { method: 'POST', ...init, headers })
  }
  const signed = (url: string, secret: string, body = '{"event":"paid"}', id = `msg_${crypto.randomUUID()}`, extra: Record<string, string> = {}, at = now()) =>
    call(url, { body, headers: { 'content-type': 'application/json', 'webhook-id': id, 'webhook-timestamp': String(at), 'webhook-signature': sign(secret, id, at, body), ...extra } })
  const runsOf = async (workflow: string) => (await sql<{ id: string; input: any; key: string | null }>`select id, input, key from workflows.runs where workflow_id = ${workflow} order by created_at`.execute(db)).rows

  it('starts one run per call with the call as its input, once per webhook-id', async () => {
    const hook = await hooked()
    const id = 'msg_once'
    const response = await signed(`${hook.url}?ref=42`, hook.secret, '{"event":"paid"}', id, { 'x-event': 'invoice' })
    expect(response.status).toBe(202)
    const { run_id } = (await response.json()) as { run_id: string }
    const [run] = await runsOf(hook.id)
    expect(run).toMatchObject({ id: run_id, key: id, input: { method: 'POST', query: { ref: '42' }, body: { event: 'paid' }, headers: { 'x-event': 'invoice', 'content-type': 'application/json' } } })
    expect(Object.keys(run!.input).toSorted()).toEqual(['body', 'headers', 'method', 'query', 'received_at'])
    const again = await signed(hook.url, hook.secret, '{"event":"paid"}', id)
    expect(((await again.json()) as { run_id: string }).run_id).toBe(run_id)
    expect(await runsOf(hook.id)).toHaveLength(1)
  })

  it('refuses a call without a valid signature: a stale timestamp, a changed body, a cookie alone, a wrong secret', async () => {
    const hook = await hooked()
    const other = await hooked()
    const body = '{"event":"paid"}'
    expect((await signed(hook.url, hook.secret, body, 'msg_old', {}, now() - 301)).status).toBe(401)
    const id = 'msg_changed'
    const at = now()
    expect((await call(hook.url, { body: '{"event":"refunded"}', headers: { 'webhook-id': id, 'webhook-timestamp': String(at), 'webhook-signature': sign(hook.secret, id, at, body) } })).status).toBe(401)
    expect((await call(hook.url, { body, headers: { cookie: 'better-auth.session_token=a-real-session', 'x-user': 'ada' } })).status).toBe(401)
    // Workflow A's secret on workflow B's URL.
    expect((await signed(other.url, hook.secret)).status).toBe(401)
    expect(await runsOf(hook.id)).toEqual([])
    expect(await runsOf(other.id)).toEqual([])
  })

  it('takes POST only, and answers 404 alike for an unknown key and a workflow turned off or deleted', async () => {
    const hook = await hooked()
    expect((await admin.request(hook.url, { method: 'GET' })).status).toBe(405)
    expect((await admin.request(hook.url, { method: 'HEAD' })).status).toBe(405)
    expect((await signed('/api/workflows/hooks/not-a-key', hook.secret)).status).toBe(404)
    await enable('ada', hook.id, null)
    expect((await signed(hook.url, hook.secret)).status).toBe(404)
    const deleted = await hooked()
    expect((await as('ada', `/api/v1/workflows/${deleted.id}`, 'DELETE')).status).toBeLessThan(300)
    expect((await signed(deleted.url, deleted.secret)).status).toBe(404)
    expect(await runsOf(hook.id)).toEqual([])
  })

  it('answers 404 for a trigger waiting for a sign-in or stopping, and for an enabled version without a webhook trigger', async () => {
    const hook = await hooked()
    for (const status of ['needs_sign_in', 'stopping']) {
      await sql`update workflows.triggers set status = ${status} where workflow_id = ${hook.id}`.execute(db)
      expect((await signed(hook.url, hook.secret)).status).toBe(404)
    }
    const moved = await hooked()
    await as('ada', `/api/v1/workflows/${moved.id}`, 'PATCH', { definition: { trigger: { manual: {} }, stateMachine: echo } })
    expect((await signed(moved.url, moved.secret)).status).toBe(404)
    expect(await runsOf(hook.id)).toEqual([])
    expect(await runsOf(moved.id)).toEqual([])
  })

  it('refuses a missing secret and an auth mode it does not know, url_only included, even when stored', async () => {
    const hook = await hooked()
    await sql`update workflows.hooks set secret = null where workflow_id = ${hook.id}`.execute(db)
    expect((await signed(hook.url, hook.secret)).status).toBe(401)
    const unknown = await hooked()
    await sql`update workflows.triggers set input = '{"auth":{"mode":"url_only"}}' where workflow_id = ${unknown.id}`.execute(db)
    expect((await call(unknown.url, { body: '{}' })).status).toBe(401)
    expect((await signed(unknown.url, unknown.secret)).status).toBe(401)
    const saved = await as('ada', '/api/v1/workflows', 'POST', { name: 'Open', definition: { trigger: { 'app:webhook': { auth: { mode: 'url_only' } } }, stateMachine: echo } })
    expect(saved.status).toBe(400)
    expect(await runsOf(hook.id)).toEqual([])
    expect(await runsOf(unknown.id)).toEqual([])
  })

  it('checks hmac and bearer calls, keeping no bearer secret in plain text', async () => {
    const hmac = await hooked({ auth: { mode: 'hmac', header: 'X-Hub-Signature-256', prefix: 'sha256=' }, idempotency_header: 'x-delivery' })
    const body = '{"action":"opened"}'
    const signature = `sha256=${createHmac('sha256', hmac.secret).update(body).digest('hex')}`
    expect((await call(hmac.url, { body })).status).toBe(401)
    expect((await call(hmac.url, { body, headers: { 'x-hub-signature-256': signature, 'x-delivery': 'd-1' } })).status).toBe(202)
    expect(await runsOf(hmac.id)).toMatchObject([{ key: 'd-1', input: { body } }])
    expect(JSON.stringify(await runsOf(hmac.id))).not.toContain(signature)

    const bearer = await hooked({ auth: { mode: 'bearer' } })
    const [row] = (await sql<{ secret: string | null; secret_hash: string }>`select secret, secret_hash from workflows.hooks where workflow_id = ${bearer.id}`.execute(db)).rows
    expect(row!.secret).toBeNull()
    expect(row!.secret_hash).not.toContain(bearer.secret)
    for (const token of ['x', 'x'.repeat(10_000), `${bearer.secret}x`]) expect((await call(bearer.url, { body, headers: { authorization: `Bearer ${token}` } })).status).toBe(401)
    expect((await call(bearer.url, { body, headers: { authorization: `Bearer ${bearer.secret}` } })).status).toBe(202)
    expect(await runsOf(bearer.id)).toHaveLength(1)
  })

  it('keeps no credential of the call in its run, its steps or the log, whatever the case of the header', async () => {
    const hook = await hooked({ auth: { mode: 'hmac', header: 'x-signature' } })
    const body = '{"a":1}'
    const signature = createHmac('sha256', hook.secret).update(body).digest('hex')
    const response = await call(hook.url, { body, headers: { 'X-SIGNATURE': signature, Authorization: 'Bearer a-token-of-the-caller', COOKIE: 'session=a-session-of-the-caller', 'Webhook-Signature': 'v1,a-signature', 'X-Forwarded-Host': 'proxy.test' } })
    expect(response.status).toBe(202)
    const { run_id } = (await response.json()) as { run_id: string }
    const steps = await until(async () => (await sql`select input, output, logs from workflows.steps where run_id = ${run_id}`.execute(db)).rows, (rows) => rows.length > 0)
    const kept = JSON.stringify([await runsOf(hook.id), steps, logged])
    for (const secret of [signature, 'a-token-of-the-caller', 'a-session-of-the-caller', 'a-signature', 'proxy.test', hook.url.split('/').at(-1)!, hook.secret]) expect(kept).not.toContain(secret)
  })

  it('reads at most the body limit, declared or streamed, and refuses a limit over 10 MiB as it is saved', async () => {
    const hook = await hooked()
    const big = 'x'.repeat(20 * 1024 * 1024)
    expect((await call(hook.url, { body: big, headers: { 'content-length': String(big.length) } })).status).toBe(413)
    const stream = new ReadableStream<Uint8Array>({ start: (controller) => { for (let i = 0; i < 20; i++) controller.enqueue(new Uint8Array(1024 * 1024)); controller.close() } })
    expect((await call(hook.url, { body: stream, duplex: 'half' } as RequestInit)).status).toBe(413)
    expect((await call(hook.url, { body: 'x'.repeat(1024 * 1024 + 1) })).status).toBe(413)
    expect(await runsOf(hook.id)).toEqual([])
    const tooLarge = await as('ada', '/api/v1/workflows', 'POST', { name: 'Big', definition: { trigger: { 'app:webhook': { body_limit: 10 * 1024 * 1024 + 1 } }, stateMachine: echo } })
    expect(tooLarge.status).toBe(400)
  })

  it('keeps a body over 1 MiB as a file of the run', async () => {
    const hook = await hooked({ body_limit: 2 * 1024 * 1024 })
    const body = JSON.stringify({ blob: 'y'.repeat(1536 * 1024) })
    expect((await signed(hook.url, hook.secret, body)).status).toBe(202)
    const [run] = await runsOf(hook.id)
    expect(run!.input.body).toMatchObject({ name: 'body', type: 'application/json', size: body.length, uri: expect.stringContaining(`workflows/${run!.id}/`) })
  })

  it('takes a trigger\'s calls a minute, spent only by calls that carry its secret', async () => {
    const hook = await hooked({ per_minute: 3 })
    // Wrong signatures from many addresses, each under its own budget, spend none of the trigger's.
    for (let i = 0; i < 10; i++) expect((await call(hook.url, { body: '{}', from: `198.51.100.${i}`, headers: { 'webhook-id': 'x', 'webhook-timestamp': String(now()), 'webhook-signature': 'v1,AAAA' } })).status).toBe(401)
    for (let i = 0; i < 3; i++) expect((await signed(hook.url, hook.secret)).status).toBe(202)
    const limited = await signed(hook.url, hook.secret)
    expect(limited.status).toBe(429)
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0)
    expect(await runsOf(hook.id)).toHaveLength(3)
  })

  it('makes an address that was refused 30 times a minute wait before any lookup, while the sender goes on', async () => {
    const hook = await hooked()
    const prober = '192.0.2.77'
    for (let i = 0; i < 30; i++) expect((await call(hook.url, { body: '{}', from: prober })).status).toBe(401)
    const waiting = await call(hook.url, { body: '{}', from: prober })
    expect(waiting.status).toBe(429)
    const id = 'msg_prober'
    const at = now()
    expect((await call(hook.url, { body: '{}', from: prober, headers: { 'webhook-id': id, 'webhook-timestamp': String(at), 'webhook-signature': sign(hook.secret, id, at, '{}') } })).status).toBe(429)
    expect((await signed(hook.url, hook.secret)).status).toBe(202)
    expect(await runsOf(hook.id)).toHaveLength(1)
  })

  it('refuses a webhook-id over 200 characters, and keys runs per workflow', async () => {
    const hook = await hooked()
    const other = await hooked()
    expect((await signed(hook.url, hook.secret, '{}', 'm'.repeat(201))).status).toBe(400)
    expect(await runsOf(hook.id)).toEqual([])
    expect((await signed(hook.url, hook.secret, '{}', 'msg_shared')).status).toBe(202)
    expect((await signed(other.url, other.secret, '{}', 'msg_shared')).status).toBe(202)
    expect(await runsOf(hook.id)).toHaveLength(1)
    expect(await runsOf(other.id)).toHaveLength(1)
  })

  it('reports a failure past its checks without the request, and answers with nothing of it', async () => {
    const hook = await hooked({}, 'ada', 'fixture:broken')
    reported.length = 0
    const response = await signed(hook.url, hook.secret, '{"echo":"me"}')
    expect(response.status).toBe(500)
    const text = await response.text()
    expect(text).not.toContain('echo')
    expect(text).not.toContain(hook.url.split('/').at(-1)!)
    expect(reported).toHaveLength(1)
    expect(reported[0]!.request).toBeUndefined()
    expect(await runsOf(hook.id)).toEqual([])
  })

  it('issues a URL only to a caller who may change the workflow in their tenant', async () => {
    const workflow = await save('ada', { 'app:webhook': {} })
    for (const user of ['bob', 'rita']) {
      const refused = await issue(user, workflow.id)
      expect(refused.status).toBe(404)
      expect(JSON.stringify(refused.body)).not.toContain('whsec_')
    }
    expect((await enable('rita', workflow.id, 1)).status).toBeGreaterThanOrEqual(400)
    expect((await enable('bob', workflow.id, 1)).status).toBe(404)
    expect((await sql`select 1 from workflows.hooks where workflow_id = ${workflow.id}`.execute(db)).rows).toEqual([])
    expect((await as('ada', `/api/v1/workflows/${workflow.id}`)).body.enabled_version).toBeNull()
    const given = `whsec_${Buffer.alloc(32, 9).toString('base64')}`
    const issued = await issue('ada', workflow.id, given)
    expect(issued.body.secret).toBe(given)
    expect((await issue('ada', workflow.id, 'whsec_c2hvcnQ=')).status).toBe(400)
  })

  it('stops a deleted workflow\'s subscribed trigger, ending its subscription with its state', async () => {
    const workflow = await save('ada', { 'fixture:subscribed': {} })
    await enable('ada', workflow.id, 1)
    // Subscribed as the start job would with the app's address, which this app without sign-in has none of.
    const [row] = (await sql<{ id: string }>`update workflows.triggers set store = '{"subscription":"sub-1"}' where workflow_id = ${workflow.id} returning id`.execute(db)).rows
    expect((await as('ada', `/api/v1/workflows/${workflow.id}`, 'DELETE')).status).toBeLessThan(300)
    await until(async () => (await sql`select 1 from workflows.triggers where id = ${row!.id}`.execute(db)).rows, (rows) => rows.length === 0)
    expect(unsubscribed).toEqual([{ subscription: 'sub-1' }])
  })
})
