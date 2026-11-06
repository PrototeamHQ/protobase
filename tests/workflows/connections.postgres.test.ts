import { sql, type Kysely } from 'kysely'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { defineRoles } from '@protobase/schema'
import { authSchemaMigration, configExports, createAdmin, createUser, startJobs, workflowsMigration, type AdminAuth, type JobsRuntime, type Session, type WorkflowsOptions } from '@protobase/server'
import { createAuth, workflowsModule } from '@protobase/server/internal'
import { ConnectionError, definePlugin } from '@protobase/workflows/plugin'
import { openPostgresDatabase, postgresTemplateReady, type PostgresDatabase } from '../../test-support/postgres-database'
import { fakeOAuthServer } from '../../packages/server/src/better-auth/connections/testing/fake-oauth-server'
import { sealToken } from '../../packages/server/src/better-auth/connections/sealed-revocation'

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

const secret = 'connections-secret-connections-secret-1234'
const baseURL = 'https://admin.example.com'
const password = 'correct horse battery'
const provider = 'workflow-acme-account'

// What a step's second token request waits on, so a test can disconnect the account between two of them.
let between: () => Promise<void> = async () => {}
let inboxExpired = false
const polled: unknown[] = []
const unsubscribed: unknown[] = []

const acmePlugin = (origin: string) =>
  definePlugin({
    name: 'acme',
    label: 'Acme',
    connections: { account: { label: 'Acme account', scopes: ['openid'], oauth: { authorization_url: `${origin}/authorize`, token_url: `${origin}/token`, user_info_url: `${origin}/userinfo`, revocation_url: `${origin}/revoke` } } },
    steps: {
      token: {
        label: 'Use the token',
        description: 'Asks for the access token twice, logs it and returns it, as a careless plugin might.',
        input: { type: 'object' },
        connection: 'account',
        run: async ({ connection, log }) => {
          const first = await connection!.accessToken()
          log(`Authorization: Bearer ${first}`)
          await between()
          const second = await connection!.accessToken()
          return { first, second }
        },
      },
    },
    triggers: {
      pushed: {
        kind: 'webhook',
        label: 'Pushed mail',
        description: 'Subscribes as the connected account.',
        input: { type: 'object', properties: { auth: { type: 'object' } } },
        connection: 'account',
        subscribe: async ({ connection }) => {
          await connection!.accessToken()
          return { subscription: 'sub-1' }
        },
        unsubscribe: async ({ connection, state }) => {
          await connection!.accessToken()
          unsubscribed.push(state)
        },
        receive: async () => ({ items: [] }),
      },
      inbox: {
        kind: 'polling',
        label: 'New mail',
        description: 'Polls as the connected account.',
        input: { type: 'object' },
        connection: 'account',
        every: '1 second',
        start: async () => 0,
        poll: async ({ cursor, connection }) => {
          if (inboxExpired) throw new ConnectionError('link_expired', 'The provider refused the sign-in')
          await connection!.accessToken()
          polled.push(cursor)
          return { items: [], cursor: (cursor as number) + 1 }
        },
      },
    },
  })

const roles = defineRoles<'workflows' | 'workflow_versions' | 'workflow_runs' | 'workflow_steps' | 'workflow_triggers'>({
  builder: ['workflows.*', 'workflow_versions.read', 'workflow_runs.*', 'workflow_steps.read', 'workflow_triggers.read'],
  reader: ['workflows.read', 'workflow_versions.read', 'workflow_runs.*', 'workflow_steps.read', 'workflow_triggers.read'],
  // Changes only the workflows named Other.
  narrow: ['workflows.read', { 'workflows.update': { filter: "name = 'Other'" } }, 'workflow_versions.read', 'workflow_runs.*', 'workflow_steps.read', 'workflow_triggers.read'],
})

const until = async <T>(read: () => Promise<T>, done: (value: T) => boolean, ms = 15_000) => {
  const end = Date.now() + ms
  for (;;) {
    const value = await read()
    if (done(value) || Date.now() > end) return value
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
}

describe.skipIf(!(await postgresTemplateReady('jobs')))("workflows signing in through their owner's connected account", () => {
  let pg: PostgresDatabase
  let db: Kysely<any>
  let runtime: JobsRuntime
  let fake: Awaited<ReturnType<typeof fakeOAuthServer>>
  let auth: AdminAuth
  let app: ReturnType<typeof createAdmin>
  let ada: string
  let grace: string
  // The role each user holds in tenant 1 now, which the run-time check reads.
  const held = new Map<string, string[]>()
  const cookies = new Map<string, string>()

  beforeAll(async () => {
    fake = await fakeOAuthServer()
    pg = await openPostgresDatabase('jobs')
    db = pg.db
    const plugin = acmePlugin(fake.origin)
    const workflows: WorkflowsOptions = { savedByRoles: async ({ id, tenant }) => (String(tenant) === '1' ? (held.get(id) ?? []) : []), plugins: [{ plugin, source: 'acme' }], allowPrivateAddresses: true }
    auth = createAuth({
      database: { dialect: pg.dialect, type: 'postgres', schemaName: 'auth' },
      baseURL,
      secret,
      mailer: false,
      encryptOAuthTokens: true,
      connections: { 'acme:account': { clientId: 'acme-client', clientSecret: 'acme-client-secret-value' } },
      workflowConnections: { declared: [{ plugin: 'acme', name: 'account', declaration: plugin.connections.account }], allowPrivateAddresses: true },
    })
    await pg.exec((await authSchemaMigration(auth))!)
    await pg.exec((await workflowsMigration(db, workflows))!)
    ada = String((await createUser(auth, { email: 'ada@example.com', password, role: 'admin' })).id)
    grace = String((await createUser(auth, { email: 'grace@example.com', password, role: 'admin' })).id)
    held.set(ada, ['builder']).set(grace, ['builder'])
    // Each request names its caller: `x-user`, and `x-as` for staff signed in as them or an outside app acting for them.
    const authenticate = (request: Request): Session => {
      const id = request.headers.get('x-user')!
      const as = request.headers.get('x-as')
      return { user: { id, roles: held.get(id) ?? [] }, tenant: 1, organization: { id: 1 }, ...(as === 'client' ? { client: { id: 'mcp-client', scopes: [] } } : { signIn: { staff: as === 'staff' } }) }
    }
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const { resources, views } = configExports({ ...workflowsModule(workflows) })
    app = createAdmin({ resources, views, db, auth, authenticate, workflows, options: { roles } })
    runtime = await startJobs({ db, jobs: app.jobs, pollSeconds: 0.5, shutdownSeconds: 5, onError: (error) => { throw error } })
  })

  afterAll(async () => {
    await runtime?.stop()
    await pg?.close()
    await fake?.close()
  })

  // Ada's browser: signed in with her password, then through Better Auth's handler as the account page calls it.
  const browser = async (path: string, init: { method?: string; body?: object } = {}) => {
    if (cookies.size === 0) {
      const signedIn = await auth.api.signInEmail({ body: { email: 'ada@example.com', password }, returnHeaders: true })
      for (const line of signedIn.headers.getSetCookie()) cookies.set(...(line.split(';')[0]!.split('=') as [string, string]))
    }
    const headers = { cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join('; '), origin: baseURL, ...(init.body && { 'content-type': 'application/json' }) }
    const response = await auth.handler(new Request(`${baseURL}/api/auth${path}`, { method: init.method ?? 'GET', headers, ...(init.body && { body: JSON.stringify(init.body) }) }))
    for (const line of response.headers.getSetCookie()) cookies.set(...(line.split(';')[0]!.split('=') as [string, string]))
    return { response, text: await response.text() }
  }
  const connect = async () => {
    const start = await browser('/link-social', { method: 'POST', body: { provider, callbackURL: '/account', disableRedirect: true } })
    const state = new URL((JSON.parse(start.text) as { url: string }).url).searchParams.get('state')
    await browser(`/callback/${provider}?code=code-${Date.now()}&state=${state}`)
    return (await sql<{ id: string }>`select id from auth.account where provider_id = ${provider} and user_id = ${ada}`.execute(db)).rows[0]?.id
  }

  const as = async (user: string, path: string, method = 'GET', body?: unknown, extra: Record<string, string> = {}) => {
    const response = await app.request(`/api/v1${path}`, { method, headers: { 'content-type': 'application/json', 'if-match': '*', 'x-user': user, ...extra }, ...(body !== undefined && { body: JSON.stringify(body) }) })
    return { status: response.status, body: (await response.json().catch(() => null)) as Record<string, any> }
  }
  const definition = (account?: string, trigger: object = { manual: {} }) => ({
    trigger,
    stateMachine: { QueryLanguage: 'JSONata', StartAt: 'Use', States: { Use: { Type: 'Task', Resource: 'acme:token', End: true } } },
    ...(account && { connections: { 'acme:account': account } }),
  })
  const save = async (user: string, account?: string, trigger?: object) => (await as(user, '/workflows', 'POST', { name: 'Mail', definition: definition(account, trigger) })).body as { id: string; version: number }
  const run = async (user: string, workflow: string) => {
    const id = (await as(user, '/workflow_runs', 'POST', { workflow_id: workflow, input: {} })).body.id as string
    return until(async () => (await sql<{ status: string; error: string | null; cause: string | null; output: unknown }>`select status, error, cause, output from workflows.runs where id = ${id}`.execute(db)).rows[0]!, (row) => row.status === 'succeeded' || row.status === 'failed')
  }
  const everything = async () => JSON.stringify([(await sql`select * from workflows.runs`.execute(db)).rows, (await sql`select * from workflows.steps`.execute(db)).rows, (await sql`select * from workflows.triggers`.execute(db)).rows])

  it("gives a run's step a token of the account its version binds, once the account's owner turned it on, and records none", async () => {
    const account = (await connect())!
    const workflow = await save(ada, account)
    expect((await as(ada, `/workflows/${workflow.id}`, 'PATCH', { enabled_version: workflow.version })).status).toBe(200)
    expect(await run(ada, workflow.id)).toMatchObject({ status: 'succeeded', output: { first: '[redacted]', second: '[redacted]' } })
    expect(await everything()).not.toMatch(/snapshot-(access|refresh)_token/)
  })

  it("refuses to turn on a version that binds someone else's account, or the owner's through staff or an outside app, with one answer", async () => {
    const account = (await connect())!
    const workflow = await save(grace, account)
    const answers = [
      await as(grace, `/workflows/${workflow.id}`, 'PATCH', { enabled_version: workflow.version }),
      await as(ada, `/workflows/${workflow.id}`, 'PATCH', { enabled_version: workflow.version }, { 'x-as': 'staff' }),
      await as(ada, `/workflows/${workflow.id}`, 'PATCH', { enabled_version: workflow.version }, { 'x-as': 'client' }),
    ]
    for (const answer of answers) expect(answer).toMatchObject({ status: 403, body: { type: 'urn:protobase:problem:own-sign-in-only' } })
    const unknown = await save(grace, 'no-such-account')
    expect((await as(grace, `/workflows/${unknown.id}`, 'PATCH', { enabled_version: unknown.version })).body.detail).toBe(answers[0]!.body.detail)
    expect((await sql<{ enabled_version: number | null }>`select enabled_version from workflows.workflows where id = ${workflow.id}`.execute(db)).rows[0]!.enabled_version).toBeNull()
  })

  it('fails a step with not_connected for a version that binds no account, one not turned on, or turned off since', async () => {
    const account = (await connect())!
    const unbound = await save(ada)
    expect(await run(ada, unbound.id)).toMatchObject({ status: 'failed', cause: expect.stringContaining('no connection it may use for acme:account') })
    const off = await save(ada, account)
    const notTurnedOn = await run(ada, off.id)
    expect(notTurnedOn).toMatchObject({ status: 'failed' })
    await as(ada, `/workflows/${off.id}`, 'PATCH', { enabled_version: off.version })
    await as(ada, `/workflows/${off.id}`, 'PATCH', { enabled_version: null })
    expect((await run(ada, off.id)).cause).toBe(notTurnedOn.cause)
  })

  it('gives no token once the person who turned it on lost the right to change workflows, or left the tenant', async () => {
    const account = (await connect())!
    const workflow = await save(ada, account)
    await as(ada, `/workflows/${workflow.id}`, 'PATCH', { enabled_version: workflow.version })
    held.set(ada, ['reader'])
    expect(await run(grace, workflow.id)).toMatchObject({ status: 'failed', cause: expect.stringContaining('no connection it may use') })
    held.set(ada, [])
    expect(await run(grace, workflow.id)).toMatchObject({ status: 'failed', cause: expect.stringContaining('no connection it may use') })
    held.set(ada, ['builder'])
    expect(await run(grace, workflow.id)).toMatchObject({ status: 'succeeded' })
  })

  it('gives no token once the update row filter of the person who turned it on leaves the workflow out', async () => {
    const account = (await connect())!
    const workflow = await save(ada, account)
    await as(ada, `/workflows/${workflow.id}`, 'PATCH', { enabled_version: workflow.version })
    held.set(ada, ['narrow'])
    const refused = await run(grace, workflow.id)
    held.set(ada, ['builder'])
    expect(refused).toMatchObject({ status: 'failed', cause: expect.stringContaining('no connection it may use') })
    await as(ada, `/workflows/${workflow.id}`, 'PATCH', { enabled_version: null })
  })

  it("withdraws the consent on other versions once someone else turns one on, and keeps the same person's", async () => {
    const account = (await connect())!
    const workflow = await save(ada, account)
    await as(ada, `/workflows/${workflow.id}`, 'PATCH', { enabled_version: workflow.version })
    const then = definition(account)
    const states = { Use: { Type: 'Task', Resource: 'acme:token', Next: 'Done' }, Done: { Type: 'Succeed' } }
    expect((await as(ada, `/workflows/${workflow.id}`, 'PATCH', { definition: { ...then, stateMachine: { ...then.stateMachine, States: states } } })).status).toBe(200)
    const consents = async () => (await sql<{ version: number; enabled_by: string | null }>`select version, enabled_by from workflows.versions where workflow_id = ${workflow.id} order by version`.execute(db)).rows
    expect(await consents()).toEqual([{ version: 1, enabled_by: ada }, { version: 2, enabled_by: ada }])
    const unconnected = { trigger: { manual: {} }, stateMachine: { QueryLanguage: 'JSONata', StartAt: 'Done', States: { Done: { Type: 'Succeed' } } } }
    expect((await as(grace, `/workflows/${workflow.id}`, 'PATCH', { definition: unconnected })).status).toBe(200)
    expect(await consents()).toEqual([{ version: 1, enabled_by: null }, { version: 2, enabled_by: null }, { version: 3, enabled_by: grace }])
    await as(grace, `/workflows/${workflow.id}`, 'PATCH', { enabled_version: null })
  })

  const pushedTrigger = async (workflow: string) => (await sql<{ id: string; status: string; store: unknown; enabled_by: string | null }>`select id, status, store, enabled_by from workflows.triggers where workflow_id = ${workflow}`.execute(db)).rows[0]
  const subscribed = async (workflow: string) => until(() => pushedTrigger(workflow), (row) => row?.store !== null && row?.store !== undefined)
  const triggerById = async (id: string) => (await sql<{ id: string }>`select id from workflows.triggers where id = ${id}`.execute(db)).rows

  it("ends a turned-off webhook trigger's subscription through the account it was made with, and gives its runs no token", async () => {
    unsubscribed.length = 0
    const account = (await connect())!
    const workflow = await save(ada, account, { 'acme:pushed': {} })
    expect((await as(ada, `/workflows/${workflow.id}`, 'PATCH', { enabled_version: workflow.version })).status).toBe(200)
    expect(await subscribed(workflow.id)).toMatchObject({ status: 'active', store: { subscription: 'sub-1' }, enabled_by: ada })
    await as(ada, `/workflows/${workflow.id}`, 'PATCH', { enabled_version: null })
    await until(async () => unsubscribed.length, (count) => count > 0)
    expect(await until(() => pushedTrigger(workflow.id), (row) => row === undefined)).toBeUndefined()
    expect(unsubscribed).toEqual([{ subscription: 'sub-1' }])
    expect(await run(ada, workflow.id)).toMatchObject({ status: 'failed', cause: expect.stringContaining('no connection it may use') })
    expect(await everything()).not.toMatch(/snapshot-(access|refresh)_token/)
  })

  it("ends the subscription through its maker's account once someone else turns on a version with another trigger", async () => {
    unsubscribed.length = 0
    const account = (await connect())!
    const workflow = await save(ada, account, { 'acme:pushed': {} })
    await as(ada, `/workflows/${workflow.id}`, 'PATCH', { enabled_version: workflow.version })
    const { id } = (await subscribed(workflow.id))!
    const unconnected = { trigger: { manual: {} }, stateMachine: { QueryLanguage: 'JSONata', StartAt: 'Done', States: { Done: { Type: 'Succeed' } } } }
    expect((await as(grace, `/workflows/${workflow.id}`, 'PATCH', { definition: unconnected })).status).toBe(200)
    await until(async () => unsubscribed.length, (count) => count > 0)
    expect(await until(() => triggerById(id), (rows) => rows.length === 0)).toEqual([])
    expect(unsubscribed).toEqual([{ subscription: 'sub-1' }])
    await as(grace, `/workflows/${workflow.id}`, 'PATCH', { enabled_version: null })
  })

  it('gives a step no further token once its account is disconnected between two requests', async () => {
    const account = (await connect())!
    const workflow = await save(ada, account)
    await as(ada, `/workflows/${workflow.id}`, 'PATCH', { enabled_version: workflow.version })
    between = async () => void (await browser('/connections/disconnect', { method: 'POST', body: { accountId: account } }))
    const result = await run(ada, workflow.id)
    between = async () => {}
    expect(result).toMatchObject({ status: 'failed', cause: expect.stringContaining('no connection it may use') })
    expect(await everything()).not.toMatch(/snapshot-(access|refresh)_token/)
  })

  it('waits for a new sign-in when the provider refuses it, and polls again from its cursor once its owner connects the account again', async () => {
    const account = (await connect())!
    const workflow = await save(ada, account, { 'acme:inbox': {} })
    expect((await as(ada, `/workflows/${workflow.id}`, 'PATCH', { enabled_version: workflow.version })).status).toBe(200)
    const trigger = async () => (await sql<{ status: string; cursor: number; connection_id: string }>`select status, cursor, connection_id from workflows.triggers where workflow_id = ${workflow.id}`.execute(db)).rows[0]
    await until(trigger, (row) => (row?.cursor ?? 0) >= 1)
    expect((await trigger())!.connection_id).toBe(account)
    inboxExpired = true
    const waiting = await until(trigger, (row) => row?.status === 'needs_sign_in')
    expect(waiting).toMatchObject({ status: 'needs_sign_in' })
    inboxExpired = false
    polled.length = 0
    expect(await connect()).toBe(account)
    await until(trigger, (row) => row?.status === 'active' && polled.length > 0)
    expect(polled[0]).toBe(waiting!.cursor)
    await as(ada, `/workflows/${workflow.id}`, 'PATCH', { enabled_version: null })
  })
  it("lists on the account page the workflows that use an account: turned on by its owner, binding it, and still theirs to change", async () => {
    const account = (await connect())!
    const named = async (user: string, name: string) => (await as(user, '/workflows', 'POST', { name, definition: definition(account) })).body as { id: string; version: number }
    const used = await named(ada, 'Mail')
    const other = await named(ada, 'Other')
    const off = await named(ada, 'Off')
    for (const workflow of [used, other]) expect((await as(ada, `/workflows/${workflow.id}`, 'PATCH', { enabled_version: workflow.version })).status).toBe(200)
    // Grace's workflow binds Ada's account and is turned on as Grace, which a save refuses, so it is written directly.
    const forged = await named(grace, 'Forged')
    await sql`update workflows.versions set enabled_by = ${grace} where workflow_id = ${forged.id}`.execute(db)
    await sql`update workflows.workflows set enabled_version = ${forged.version} where id = ${forged.id}`.execute(db)
    const usedBy = async () => {
      const listed = JSON.parse((await browser('/connections')).text) as { connections: { accounts: { id: string; used_by: { id: string; name: string }[] }[] }[] }
      return listed.connections.flatMap(({ accounts }) => accounts).find(({ id }) => id === account)!.used_by.map(({ id }) => id)
    }
    const listed = await usedBy()
    expect(listed).toEqual(expect.arrayContaining([used.id, other.id]))
    for (const id of [off.id, forged.id]) expect(listed).not.toContain(id)
    held.set(ada, ['narrow'])
    const narrowed = await usedBy()
    held.set(ada, ['builder'])
    expect(narrowed).toEqual([other.id])
    for (const workflow of [used, other]) await as(ada, `/workflows/${workflow.id}`, 'PATCH', { enabled_version: null })
    await sql`update workflows.workflows set enabled_version = null where id = ${forged.id}`.execute(db)
  })

  describe('a revocation the provider did not take', () => {
    type Row = { id: string; provider: string; hint: string; token: string }
    const revocations = async () => (await sql<Row>`select id, provider, hint, token from workflows.connection_revocations`.execute(db)).rows
    const revokeJob = () => app.jobs.find((job) => job.name === 'workflows.connection-revoke')!
    // One try of the job, as the worker runs it, the `attempt`-th of `maxAttempts`.
    const attempt = async (id: string, attempt: number, maxAttempts = 10) =>
      await revokeJob().options.run({ revocation: id }, { db, job: { id: 'job', name: 'workflows.connection-revoke', attempt, maxAttempts, startedOn: new Date() }, signal: new AbortController().signal, decryptField: async () => null })
    const queued = async (token: string) =>
      (await sql<{ id: string }>`insert into workflows.connection_revocations (provider, hint, token) values (${provider}, 'refresh_token', ${token}) returning id`.execute(db)).rows[0]!.id
    const jobRows = async () => JSON.stringify((await sql`select data, output from jobs.job where name = 'workflows.connection-revoke'`.execute(db)).rows)
    afterEach(() => {
      fake.answers['/revoke'] = 'revoke-ok'
      vi.restoreAllMocks()
      vi.spyOn(console, 'log').mockImplementation(() => {})
    })

    it('queues its token encrypted, revokes it on a retry once the provider takes it, and keeps nothing of it', async () => {
      const account = (await connect())!
      const workflow = await save(ada, account, { 'acme:inbox': {} })
      await as(ada, `/workflows/${workflow.id}`, 'PATCH', { enabled_version: workflow.version })
      fake.answers['/revoke'] = 'revoke-error'
      expect(JSON.parse((await browser('/connections/disconnect', { method: 'POST', body: { accountId: account } })).text)).toEqual({ disconnected: true, revoked: false })
      const [row] = await revocations()
      expect(row).toMatchObject({ provider, hint: 'refresh_token' })
      expect(row!.token).not.toMatch(/snapshot-/)
      expect(await jobRows()).toContain(row!.id)
      expect(await jobRows()).not.toMatch(/snapshot-|\$ba\$/)
      expect((await sql<{ status: string }>`select status from workflows.triggers where workflow_id = ${workflow.id}`.execute(db)).rows[0]!.status).toBe('needs_sign_in')

      await expect(attempt(row!.id, 1)).rejects.toThrow('tried again')
      expect(await revocations()).toHaveLength(1)
      fake.answers['/revoke'] = 'revoke-ok'
      await attempt(row!.id, 2)
      expect(fake.callsTo('/revoke').at(-1)!.form).toMatchObject({ token: expect.stringMatching(/^snapshot-refresh_token-/), token_type_hint: 'refresh_token' })
      expect(await revocations()).toEqual([])
      await attempt(row!.id, 3)
      await as(ada, `/workflows/${workflow.id}`, 'PATCH', { enabled_version: null })
    })

    it('drops its token on the last try the provider refuses, saying no more than that', async () => {
      const logged = [vi.spyOn(console, 'log'), vi.spyOn(console, 'error'), vi.spyOn(console, 'warn')]
      fake.answers['/revoke'] = 'revoke-error'
      const id = await queued(await sealToken((await auth.$context).secretConfig, 'refresh-given-up'))
      const failure = await attempt(id, 10).catch((error: unknown) => error as Error)
      expect(failure).toMatchObject({ message: 'The provider did not revoke the token in 10 tries: it is dropped' })
      expect(JSON.stringify([failure, (failure as Error).stack])).not.toMatch(/refresh-given-up|authorization|client_secret/i)
      for (const spy of logged) for (const call of spy.mock.calls) expect(JSON.stringify(call)).not.toContain('refresh-given-up')
      expect(await revocations()).toEqual([])
    })

    it('drops a token that no longer decrypts, as after the secret changed, failing for good without calling the provider', async () => {
      const calls = fake.callsTo('/revoke').length
      const id = await queued(await sealToken('a-retired-secret-a-retired-secret-12345', 'refresh-old-secret'))
      await expect(attempt(id, 1)).rejects.toMatchObject({ name: 'FatalJobError' })
      expect(await revocations()).toEqual([])
      expect(fake.callsTo('/revoke')).toHaveLength(calls)
    })

    it('keeps no token when its job cannot be queued', async () => {
      const account = (await connect())!
      fake.answers['/revoke'] = 'revoke-error'
      vi.spyOn(revokeJob(), 'enqueue').mockRejectedValueOnce(new Error('queue down'))
      vi.spyOn(console, 'error').mockImplementation(() => {})
      expect((await browser('/connections/disconnect', { method: 'POST', body: { accountId: account } })).response.ok).toBe(false)
      expect(await revocations()).toEqual([])
    })
  })
})
