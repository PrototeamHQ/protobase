import { refreshAccessToken } from 'better-auth/oauth2'
import { sql, type Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { defineRoles } from '@protobase/schema'
import { authSchemaMigration, configExports, createAdmin, createUser, startJobs, workflowsMigration, type AdminAuth, type JobsRuntime, type Session, type WorkflowsOptions } from '@protobase/server'
import { createAuth, workflowsModule } from '@protobase/server/internal'
import { gmailPlugin } from '@protobase/workflow-plugins/gmail'
import { openPostgresDatabase, postgresTemplateReady, type PostgresDatabase } from '../../test-support/postgres-database'
import { fakeGmail } from '../../test-support/fake-gmail/fake-gmail'
import { mail } from '../../test-support/fake-gmail/mail'
import { fakeOAuthServer } from '../../packages/server/src/better-auth/connections/testing/fake-oauth-server'

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

const secret = 'gmail-trigger-secret-gmail-trigger-secret-1234'
const google = { clientId: 'client-1.apps.googleusercontent.com', clientSecret: 'google-client-secret-value' }
const readonly = 'https://www.googleapis.com/auth/gmail.readonly'

const roles = defineRoles<'workflows' | 'workflow_versions' | 'workflow_runs' | 'workflow_steps' | 'workflow_triggers'>({
  builder: ['workflows.*', 'workflow_versions.read', 'workflow_runs.*', 'workflow_steps.read', 'workflow_triggers.read'],
})

const until = async <T>(read: () => Promise<T>, done: (value: T) => boolean, ms = 15_000) => {
  const end = Date.now() + ms
  for (;;) {
    const value = await read()
    if (done(value) || Date.now() > end) return value
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
}
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe.skipIf(!(await postgresTemplateReady('jobs')))('gmail:new_mail on the server, signed in through Google', () => {
  let pg: PostgresDatabase
  let db: Kysely<any>
  let runtime: JobsRuntime
  let oauth: Awaited<ReturnType<typeof fakeOAuthServer>>
  let gmail: ReturnType<typeof fakeGmail>
  let served: Awaited<ReturnType<ReturnType<typeof fakeGmail>['serve']>>
  let auth: AdminAuth
  let app: ReturnType<typeof createAdmin>
  let ada: string

  beforeAll(async () => {
    oauth = await fakeOAuthServer('google')
    oauth.answers['/token'] = 'token-refresh'
    gmail = fakeGmail()
    served = await gmail.serve()
    // The answer Google's token endpoint gives a refresh, `token-refresh`, holds this token.
    gmail.tokens.add('snapshot-access_token-2')
    pg = await openPostgresDatabase('jobs')
    db = pg.db
    // The default plugin, at the fake's address and polling every second rather than every minute, so a test waits less.
    const plugin = gmailPlugin({ apiUrl: served.url })
    const fast = { ...plugin, triggers: { new_mail: { ...plugin.triggers.new_mail, every: '1 second' } } }
    const workflows: WorkflowsOptions = { savedByRoles: async () => ['builder'], plugins: [{ plugin: fast, source: 'protobase.config.ts' }], allowPrivateAddresses: true }
    auth = createAuth({
      database: { dialect: pg.dialect, type: 'postgres', schemaName: 'auth' },
      baseURL: 'https://admin.example.com',
      secret,
      mailer: false,
      encryptOAuthTokens: true,
      // Google sign-in as Better Auth's provider makes it, its refresh sent to the fake token endpoint instead.
      socialProviders: { google: { ...google, refreshAccessToken: (refreshToken: string) => refreshAccessToken({ refreshToken, options: google, tokenEndpoint: `${oauth.origin}/token` }) } },
      workflowConnections: { declared: [{ plugin: 'gmail', name: 'google', declaration: fast.connections.google }], allowPrivateAddresses: true },
    })
    await pg.exec((await authSchemaMigration(auth))!)
    await pg.exec((await workflowsMigration(db, workflows))!)
    ada = String((await createUser(auth, { email: 'ada@example.com', password: 'correct horse battery', role: 'admin' })).id)
    const authenticate = (): Session => ({ user: { id: ada, roles: ['builder'] }, tenant: 1, organization: { id: 1 }, signIn: { staff: false } })
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const { resources, views } = configExports({ ...workflowsModule(workflows) })
    app = createAdmin({ resources, views, db, auth, authenticate, workflows, options: { roles } })
    runtime = await startJobs({ db, jobs: app.jobs, pollSeconds: 0.5, shutdownSeconds: 5, onError: (error) => { throw error } })
  })

  afterAll(async () => {
    await runtime?.stop()
    await pg?.close()
    await oauth?.close()
    await served?.close()
  })

  // Ada's Google account as linking it left it an hour ago, written as Better Auth stores it: its access token expired,
  // its refresh token as Google gave it, unencrypted as an account linked before encryption was turned on.
  const linked = async () => {
    const id = `account-${crypto.randomUUID()}`
    await sql`insert into auth.account (id, account_id, provider_id, user_id, access_token, refresh_token, access_token_expires_at, scope, updated_at)
      values (${id}, ${`google-sub-${id}`}, 'google', ${ada}, 'snapshot-access_token-1', 'snapshot-refresh_token-1', now() - interval '1 hour', ${`openid,email,${readonly}`}, now())`.execute(db)
    return id
  }
  const as = async (path: string, method = 'GET', body?: unknown) => {
    const response = await app.request(`/api/v1${path}`, { method, headers: { 'content-type': 'application/json', 'if-match': '*' }, ...(body !== undefined && { body: JSON.stringify(body) }) })
    return { status: response.status, body: (await response.json().catch(() => null)) as Record<string, any> }
  }
  const turnedOn = async (account: string) => {
    const definition = { trigger: { 'gmail:new_mail': { subject: 'invoice' } }, connections: { 'gmail:google': account }, stateMachine: { QueryLanguage: 'JSONata', StartAt: 'Done', States: { Done: { Type: 'Succeed' } } } }
    const workflow = (await as('/workflows', 'POST', { name: 'Invoices', definition })).body as { id: string; version: number }
    expect((await as(`/workflows/${workflow.id}`, 'PATCH', { enabled_version: workflow.version })).status).toBe(200)
    return workflow.id
  }
  const off = (workflow: string) => as(`/workflows/${workflow}`, 'PATCH', { enabled_version: null })
  const runsOf = async (workflow: string) => (await sql<{ key: string; input: Record<string, unknown> }>`select key, input from workflows.runs where workflow_id = ${workflow} order by created_at`.execute(db)).rows
  const triggerOf = async (workflow: string) => (await sql<{ status: string; cursor: { history_id?: string } | null; last_error: { code: string } | null }>`select status, cursor, last_error from workflows.triggers where workflow_id = ${workflow}`.execute(db)).rows[0]
  const historyCalls = () => gmail.callsTo('history').length
  const everything = async () => JSON.stringify([(await sql`select * from workflows.runs`.execute(db)).rows, (await sql`select * from workflows.steps`.execute(db)).rows, (await sql`select * from workflows.triggers`.execute(db)).rows])

  it('refreshes the expired token, starts one run per new mail that passes its filter, none again, and stops once turned off', async () => {
    const workflow = await turnedOn(await linked())
    await until(() => triggerOf(workflow), (row) => row?.cursor?.history_id !== undefined)
    gmail.deliver([mail({ subject: 'Lunch?' })])
    const [invoice] = gmail.deliver([mail({ subject: 'Invoice 7', attachments: [{ filename: 'invoice-7.pdf', type: 'application/pdf', content: '%PDF' }] })])
    const runs = await until(() => runsOf(workflow), (rows) => rows.length > 0)
    expect(runs).toEqual([{ key: invoice, input: expect.objectContaining({ message_id: invoice, from: { name: 'Ada', address: 'ada@example.com' }, subject: 'Invoice 7', text: 'Hi there', attachments: [{ filename: 'invoice-7.pdf', content_type: 'application/pdf', size: 4 }] }) }])
    expect(oauth.callsTo('/token').at(-1)!.form).toMatchObject({ grant_type: 'refresh_token', refresh_token: 'snapshot-refresh_token-1' })
    expect(gmail.calls.some(({ token }) => token === 'snapshot-access_token-2')).toBe(true)

    // Later polls see the same history and start no run for it.
    const seen = historyCalls()
    await until(async () => historyCalls(), (count) => count >= seen + 2)
    expect(await runsOf(workflow)).toHaveLength(1)
    expect(await everything()).not.toMatch(/snapshot-(access|refresh)_token|google-client-secret-value/)

    await off(workflow)
    await until(() => triggerOf(workflow), (row) => row === undefined)
    const stopped = historyCalls()
    await pause(2_000)
    expect(historyCalls()).toBe(stopped)
  })

  it('makes no Gmail call while the token endpoint fails, and waits for a new sign-in once Google refuses the grant', async () => {
    // The token endpoint answers 404 with no body, as a provider that is down: the trigger fails and backs off.
    delete oauth.answers['/token']
    const before = gmail.calls.length
    const down = await turnedOn(await linked())
    expect(await until(() => triggerOf(down), (row) => row?.status === 'failing')).toMatchObject({ status: 'failing' })
    expect(gmail.calls.length).toBe(before)
    await off(down)

    // Google refuses the refresh token itself: the trigger waits for its owner to sign in again, asking no more.
    oauth.answers['/token'] = 'token-refresh-invalid-grant'
    const refused = await turnedOn(await linked())
    expect(await until(() => triggerOf(refused), (row) => row?.status === 'needs_sign_in')).toMatchObject({ status: 'needs_sign_in' })
    const refreshes = oauth.callsTo('/token').length
    await pause(2_000)
    expect(gmail.calls.length).toBe(before)
    expect(oauth.callsTo('/token')).toHaveLength(refreshes)
    expect([...(await runsOf(down)), ...(await runsOf(refused))]).toEqual([])
    expect(await everything()).not.toMatch(/snapshot-(access|refresh)_token|google-client-secret-value/)
    oauth.answers['/token'] = 'token-refresh'
    await off(refused)
  })
})
