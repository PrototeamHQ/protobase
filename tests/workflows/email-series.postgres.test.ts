import { sql, type Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { defineRoles } from '@protobase/schema'
import { configExports, createAdmin, startJobs, unsubscribesSchemaSql, workflowsSchemaSql, type JobsRuntime, type MailMessage, type WorkflowsOptions } from '@protobase/server'
import { localFiles, workflowsModule } from '@protobase/server/internal'
import welcomeSeries from '../../docs-examples/workflows/welcome-series.json'
import { tempDir } from '../../packages/server/src/files/testing/temp-dir'
import { openPostgresDatabase, postgresTemplateReady, statementTimeoutMs, type PostgresDatabase } from '../../test-support/postgres-database'
import { definitionFields } from '../../test-support/workflow-fields'

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

const roles = defineRoles<'workflows' | 'workflow_versions' | 'workflow_runs'>({ builder: ['workflows.*', 'workflow_versions.read', 'workflow_runs.*'] })
const workflows: WorkflowsOptions = { savedByRoles: async () => ['builder'] }

// The documented series as it is, but started by hand and waiting 1 second in place of 3 and 11 days.
const quick = structuredClone(welcomeSeries)
quick.trigger = { manual: {} } as never
quick.stateMachine.States['Three days'].Seconds = 1
quick.stateMachine.States['Two weeks'].Seconds = 1

describe.skipIf(!(await postgresTemplateReady('jobs')))('an email series in a workflow', () => {
  let pg: PostgresDatabase
  let db: Kysely<any>
  let admin: ReturnType<typeof createAdmin>
  let runtime: JobsRuntime
  let folder: Awaited<ReturnType<typeof tempDir>>
  const sent: MailMessage[] = []
  const errors: unknown[] = []
  // Ada's run stays in her first send until the test has unsubscribed her, so her next mail is checked only after that.
  let releaseAda = () => {}
  const adaHeld = new Promise<void>((resolve) => { releaseAda = resolve })

  beforeAll(async () => {
    pg = await openPostgresDatabase('jobs')
    db = pg.db
    folder = await tempDir()
    await pg.exec(workflowsSchemaSql(workflows))
    await pg.exec(unsubscribesSchemaSql())
    const { resources, views } = configExports(workflowsModule(workflows))
    const files = { providers: { private: localFiles({ dir: folder.dir }) }, secret: 'files-secret-for-the-email-series' }
    admin = createAdmin({ resources, views, db, files, secret: 'secret-for-the-email-series', unsubscribe: { appUrl: 'https://shop.example.com' }, authenticate: () => ({ user: { id: 'ada', roles: ['builder'] }, tenant: '1' }), workflows, options: { statementTimeoutMs, roles } })
    const mailer = {
      send: async (message: MailMessage) => {
        sent.push(message)
        if (message.to === 'ada@example.com') await adaHeld
        return { messageId: message.headers?.['Message-ID'] }
      },
    }
    runtime = await startJobs({ db, jobs: admin.jobs, pollSeconds: 0.5, shutdownSeconds: 5, mailer, unsubscribe: admin.unsubscribe, onError: (error) => errors.push(error) })
  })

  afterAll(async () => {
    await runtime?.stop()
    await pg?.close()
    await folder?.remove()
    expect(errors).toEqual([])
  })

  const post = async (path: string, body: unknown) => {
    const response = await admin.request(`/api/v1${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    if (response.status !== 201) throw new Error(await response.text())
    return (await response.json()).id as string
  }
  const runRow = async (id: string) => (await sql<{ status: string; output: unknown }>`select status, output from workflows.runs where id = ${id}`.execute(db)).rows[0]!
  const ended = (id: string) => vi.waitFor(async () => expect(['succeeded', 'failed']).toContain((await runRow(id)).status), { timeout: 20_000, interval: 50 })
  const subjectsTo = (address: string) => sent.filter((message) => message.to === address).map((message) => message.subject)
  const member = (key: string, email: string, name: string) => ({ resource: 'members', key, record: { email, name } })

  it('sends each person three timed mails with one-click unsubscribe, and an unsubscribe after the first stops the rest for that person only', async () => {
    const workflow = await post('/workflows', { name: 'Welcome series', ...definitionFields(quick) })
    const ada = await post('/workflow_runs', { workflow_id: workflow, input: member('1', 'ada@example.com', 'Ada') })
    const bob = await post('/workflow_runs', { workflow_id: workflow, input: member('2', 'bob@example.com', 'Bob') })

    // Ada unsubscribes with the first mail's own one-click link while her run is held in that send; released even when this fails.
    try {
      const first = await vi.waitFor(() => sent.find((message) => message.to === 'ada@example.com') ?? Promise.reject(new Error('no mail to ada yet')), { timeout: 10_000, interval: 20 })
      expect(first.headers).toMatchObject({ 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' })
      const link = new URL(first.headers!['List-Unsubscribe']!.slice(1, -1))
      expect(link.origin).toBe('https://shop.example.com')
      const click = await admin.request(link.pathname, { method: 'POST', body: 'List-Unsubscribe=One-Click', headers: { 'content-type': 'application/x-www-form-urlencoded' } })
      expect(click.status).toBe(200)
    } finally {
      releaseAda()
    }

    await ended(ada)
    await ended(bob)
    expect(subjectsTo('ada@example.com')).toEqual(['Welcome, Ada'])
    expect(subjectsTo('bob@example.com')).toEqual(['Welcome, Bob', 'Three tips for your first week', 'How is it going?'])
    expect(sent.filter((message) => message.to === 'bob@example.com').every((message) => message.headers?.['List-Unsubscribe']?.startsWith('<https://shop.example.com/api/unsubscribe/'))).toBe(true)
    expect(await runRow(ada)).toEqual({ status: 'succeeded', output: { sent: [], skipped: ['ada@example.com'] } })
    expect(await runRow(bob)).toEqual({ status: 'succeeded', output: { message_id: expect.any(String), sent: ['bob@example.com'], skipped: [] } })
  })
})
