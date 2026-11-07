import { sql, type Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { defineRoles } from '@protobase/schema'
import { authSchemaMigration, configExports, createAdmin, createUser, startJobs, workflowsMigration, type AdminAuth, type JobsRuntime, type Session, type WorkflowsOptions } from '@protobase/server'
import { createAuth, workflowsModule } from '@protobase/server/internal'
import { definePlugin } from '@protobase/workflows/plugin'
import { openPostgresDatabase, postgresTemplateReady, type PostgresDatabase } from '../../test-support/postgres-database'
import { fakeOAuthServer } from '../../packages/server/src/better-auth/connections/testing/fake-oauth-server'

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

const secret = 'step-cache-connections-secret-1234567890'
const baseURL = 'https://admin.example.com'
const password = 'correct horse battery'
const provider = 'workflow-acme-account'

// Each call of a step's code, so a test tells a cached result from a fresh one.
const calls: unknown[] = []
const looking = { label: 'Look up', description: 'Looks a word up as the connected account.', input: { type: 'object' }, connection: 'account' } as const
const acmePlugin = (origin: string) =>
  definePlugin({
    name: 'acme',
    label: 'Acme',
    connections: { account: { label: 'Acme account', scopes: ['openid'], oauth: { authorization_url: `${origin}/authorize`, token_url: `${origin}/token`, user_info_url: `${origin}/userinfo`, revocation_url: `${origin}/revoke` } } },
    steps: {
      lookup: { ...looking, cache: { choice: 'hidden', ttl: '1 hour' }, run: async ({ input, connection }) => (await connection!.accessToken(), calls.push(input), { word: input.word, n: calls.length }) },
      plain: { ...looking, run: async ({ input, connection }) => (await connection!.accessToken(), calls.push(input), { word: input.word, n: calls.length }) },
    },
  })

const roles = defineRoles<'workflows' | 'workflow_versions' | 'workflow_runs' | 'workflow_steps' | 'workflow_triggers'>({
  builder: ['workflows.*', 'workflow_versions.read', 'workflow_runs.*', 'workflow_steps.read', 'workflow_triggers.read'],
  reader: ['workflows.read', 'workflow_versions.read', 'workflow_runs.*', 'workflow_steps.read', 'workflow_triggers.read'],
})

describe.skipIf(!(await postgresTemplateReady('jobs')))("the step cache of a step that signs in through a connected account", () => {
  let pg: PostgresDatabase
  let db: Kysely<any>
  let runtime: JobsRuntime
  let fake: Awaited<ReturnType<typeof fakeOAuthServer>>
  let auth: AdminAuth
  let app: ReturnType<typeof createAdmin>
  let ada: string
  let grace: string
  let adas: string
  let graces: string
  const held = new Map<string, string[]>()
  const cookies = new Map<string, Map<string, string>>()

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
    const authenticate = (request: Request): Session => {
      const id = request.headers.get('x-user')!
      return { user: { id, roles: held.get(id) ?? [] }, tenant: 1, organization: { id: 1 }, signIn: { staff: false } }
    }
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const { resources, views } = configExports({ ...workflowsModule(workflows) })
    app = createAdmin({ resources, views, db, auth, authenticate, workflows, options: { roles } })
    runtime = await startJobs({ db, jobs: app.jobs, pollSeconds: 0.5, shutdownSeconds: 5, onError: (error) => { throw error } })
    adas = (await connect('ada@example.com', ada))!
    // The fake provider answers as Grace while she links her own account.
    fake.answers['/userinfo'] = 'userinfo-grace'
    graces = (await connect('grace@example.com', grace))!
    fake.answers['/userinfo'] = 'userinfo'
  })

  afterAll(async () => {
    await runtime?.stop()
    await pg?.close()
    await fake?.close()
  })

  // The browser of `email`, signed in with their password, calling Better Auth's handler as the account page does.
  const browser = async (path: string, email: string, body?: object) => {
    const jar = cookies.get(email) ?? new Map<string, string>()
    if (!cookies.has(email)) {
      const signedIn = await auth.api.signInEmail({ body: { email, password }, returnHeaders: true })
      for (const line of signedIn.headers.getSetCookie()) jar.set(...(line.split(';')[0]!.split('=') as [string, string]))
      cookies.set(email, jar)
    }
    const headers = { cookie: [...jar].map(([name, value]) => `${name}=${value}`).join('; '), origin: baseURL, ...(body && { 'content-type': 'application/json' }) }
    const response = await auth.handler(new Request(`${baseURL}/api/auth${path}`, { method: body ? 'POST' : 'GET', headers, ...(body && { body: JSON.stringify(body) }) }))
    for (const line of response.headers.getSetCookie()) jar.set(...(line.split(';')[0]!.split('=') as [string, string]))
    return response.text()
  }
  const connect = async (email: string, user: string) => {
    const start = await browser('/link-social', email, { provider, callbackURL: '/account', disableRedirect: true })
    const state = new URL((JSON.parse(start) as { url: string }).url).searchParams.get('state')
    await browser(`/callback/${provider}?code=code-${Date.now()}&state=${state}`, email)
    return (await sql<{ id: string }>`select id from auth.account where provider_id = ${provider} and user_id = ${user}`.execute(db)).rows[0]?.id
  }

  const as = async (user: string, path: string, method: string, body: unknown) => {
    const response = await app.request(`/api/v1${path}`, { method, headers: { 'content-type': 'application/json', 'if-match': '*', 'x-user': user }, body: JSON.stringify(body) })
    return { status: response.status, body: (await response.json()) as Record<string, any> }
  }
  // A workflow of one Task calling `step` with `word`, binding `account`, saved by `user` and turned on by them when it binds one.
  const workflow = async (user: string, account: string | undefined, step: string, word: string, extra: object = {}, enable = account !== undefined) => {
    const definition = {
      trigger: { manual: {} },
      stateMachine: { QueryLanguage: 'JSONata', StartAt: 'Look', States: { Look: { Type: 'Task', Resource: step, Arguments: { word }, ...extra, End: true } } },
      ...(account && { connections: { 'acme:account': account } }),
    }
    const saved = (await as(user, '/workflows', 'POST', { name: 'Lookup', definition })).body as { id: string; version: number }
    if (enable) expect((await as(user, `/workflows/${saved.id}`, 'PATCH', { enabled_version: saved.version })).status).toBe(200)
    return saved.id
  }
  const run = async (user: string, id: string) => {
    const runId = (await as(user, '/workflow_runs', 'POST', { workflow_id: id, input: {} })).body.id as string
    const row = async () => (await sql<{ status: string; cause: string | null; output: { n: number } | null }>`select status, cause, output from workflows.runs where id = ${runId}`.execute(db)).rows[0]!
    await vi.waitFor(async () => expect(['succeeded', 'failed']).toContain((await row()).status), { timeout: 20_000, interval: 100 })
    return row()
  }
  // Who each kept result of `type` was made as.
  const kept = async (type: string) => (await sql<{ who: Record<string, string | null> }>`select who from workflows.step_cache where type = ${type} order by cached_at`.execute(db)).rows.map((row) => row.who)
  const tokensKept = async () => JSON.stringify([(await sql`select * from workflows.steps`.execute(db)).rows, (await sql`select * from workflows.step_cache`.execute(db)).rows])

  it("runs again for another person's account with the same input, and serves each their own result", async () => {
    const onAda = await workflow(ada, adas, 'acme:lookup', 'cat')
    const onGrace = await workflow(grace, graces, 'acme:lookup', 'cat')
    const first = await run(ada, onAda)
    const second = await run(grace, onGrace)
    expect(second.output!.n).not.toBe(first.output!.n)
    const ran = calls.length
    expect(await run(ada, onAda)).toMatchObject({ status: 'succeeded', output: first.output })
    expect(await run(grace, onGrace)).toMatchObject({ status: 'succeeded', output: second.output })
    expect(calls).toHaveLength(ran)
    // Each entry names the account its version binds, so the connection alone keeps them apart, not only who turned it on.
    expect(await kept('acme:lookup')).toEqual([{ tenant: '1', enabler: ada, connection: adas }, { tenant: '1', enabler: grace, connection: graces }])
    expect(await tokensKept()).not.toMatch(/snapshot-(access|refresh)_token/)
  })

  it("keeps a result forced on for one account from a run on another's", async () => {
    const forced = { Cache: true }
    const onAda = await workflow(ada, adas, 'acme:plain', 'dog', forced)
    const onGrace = await workflow(grace, graces, 'acme:plain', 'dog', forced)
    const first = await run(ada, onAda)
    const second = await run(grace, onGrace)
    expect(second.output!.n).not.toBe(first.output!.n)
    expect(await run(ada, onAda)).toMatchObject({ output: first.output })
    expect((await kept('acme:plain')).map(({ connection }) => connection)).toEqual([adas, graces])
  })

  it("serves no result of Ada's account to a version that binds it but someone else turned on", async () => {
    const onAda = await workflow(ada, adas, 'acme:lookup', 'owl')
    await run(ada, onAda)
    // A save refuses to turn on a version binding someone else's account, so it is written directly.
    const forged = await workflow(grace, adas, 'acme:lookup', 'owl', {}, false)
    await sql`update workflows.versions set enabled_by = ${grace} where workflow_id = ${forged}`.execute(db)
    await sql`update workflows.workflows set enabled_version = 1 where id = ${forged}`.execute(db)
    const ran = calls.length
    expect(await run(grace, forged)).toMatchObject({ status: 'failed', output: null, cause: expect.stringContaining('no connection it may use') })
    expect(calls).toHaveLength(ran)
    await sql`update workflows.workflows set enabled_version = null where id = ${forged}`.execute(db)
  })

  it('keeps nothing for a version that binds no account', async () => {
    const entries = (await kept('acme:lookup')).length
    const ran = calls.length
    for (const _ of [1, 2]) expect(await run(ada, await workflow(ada, undefined, 'acme:lookup', 'bat'))).toMatchObject({ status: 'failed', cause: expect.stringContaining('no connection it may use') })
    expect(calls).toHaveLength(ran)
    expect(await kept('acme:lookup')).toHaveLength(entries)
  })

  it('serves no earlier result once the person who turned it on may no longer change it, or disconnected the account', async () => {
    const onAda = await workflow(ada, adas, 'acme:lookup', 'elk')
    const first = await run(ada, onAda)
    held.set(ada, ['reader'])
    const refused = await run(grace, onAda)
    held.set(ada, ['builder'])
    expect(refused).toMatchObject({ status: 'failed', cause: expect.stringContaining('no connection it may use') })
    expect(await run(ada, onAda)).toMatchObject({ status: 'succeeded', output: first.output })
    await browser('/connections/disconnect', 'ada@example.com', { accountId: adas })
    expect(await run(ada, onAda)).toMatchObject({ status: 'failed', cause: expect.stringContaining('no connection it may use') })
  })
})
