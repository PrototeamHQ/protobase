import { sql, type Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { defineRoles } from '@protobase/schema'
import { authSchemaMigration, configExports, createAdmin, createUser, startJobs, workflowsMigration, type AdminAuth, type JobsRuntime, type Session, type WorkflowsOptions } from '@protobase/server'
import { createAuth, workflowsModule } from '@protobase/server/internal'
import { ConnectionError, definePlugin } from '@protobase/workflows/plugin'
import { openPostgresDatabase, postgresTemplateReady, type PostgresDatabase } from '../../test-support/postgres-database'
import { fakeOAuthServer } from '../../packages/server/src/better-auth/connections/testing/fake-oauth-server'

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

const secret = 'connections-secret-connections-secret-1234'
const baseURL = 'https://admin.example.com'
const password = 'correct horse battery'
const provider = 'workflow-acme-account'

// What a step's second token request waits on, so a test can disconnect the account between two of them.
let between: () => Promise<void> = async () => {}
let inboxExpired = false
const polled: unknown[] = []

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
})
