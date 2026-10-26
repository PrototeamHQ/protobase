import { describe, expect, it, vi } from 'vitest'
import { sql } from 'kysely'
import { defineJob, unauthorized, type MailMessage } from '@protobase/server'
import { startWorker } from '../../src/worker/start-worker'
import { servedConfig } from '../support/served-config'
import { openPostgresDatabase, postgresTemplateReady } from '../../../../test-support/postgres-database'

const project = { config: {}, authenticate: () => { throw unauthorized('no') } }

// The worker running a project's jobs is proven by the ERP smoke's "runs the jobs in protobase worker"
// (tests/smoke/erp-bundle.test.ts).
describe.skipIf(!(await postgresTemplateReady('empty')))('protobase worker', () => {
  it('refuses a project without a database, jobs or the jobs schema, and drains the pool it made', async () => {
    const job = defineJob({ name: 'nightly', run: () => {} })
    await expect(startWorker({ config: servedConfig({ ...project, jobs: { job } }) })).rejects.toThrow('No database: set DATABASE_URL')
    const { db } = await openPostgresDatabase('empty')
    const destroy = vi.spyOn(db, 'destroy').mockImplementation(async () => {})
    await expect(startWorker({ config: servedConfig(project), databaseUrl: 'postgres://unused/app', openDb: () => ({ db }) })).rejects.toThrow('The bundle has no jobs')
    expect(destroy).toHaveBeenCalledTimes(1)
    destroy.mockRestore()
    await expect(startWorker({ config: servedConfig({ ...project, jobs: { job } }), databaseUrl: 'postgres://unused/app', openDb: () => ({ db }) })).rejects.toThrow('The jobs schema is missing')
  }, 30_000)

  it("sends the jobs' mail through the app's own mailer, auth/mailer.ts, as sign-in's", async () => {
    const sent: MailMessage[] = []
    const mailer = { send: async (message: MailMessage) => void sent.push(message) }
    const job = defineJob({ name: 'welcome', run: async (_payload, { mail }) => mail!.send({ to: 'new@example.com', subject: 'Welcome', text: 'Hello' }) })
    const { db } = await openPostgresDatabase('jobs')
    vi.spyOn(db, 'destroy').mockImplementation(async () => {})
    const worker = await startWorker({ config: servedConfig({ ...project, jobs: { job }, mailer }), databaseUrl: 'postgres://unused/app', openDb: () => ({ db }) })
    try {
      await sql`select jobs.enqueue('welcome')`.execute(db)
      await vi.waitFor(() => expect(sent).toEqual([{ to: 'new@example.com', subject: 'Welcome', text: 'Hello' }]), { timeout: 10_000 })
    } finally {
      await worker.stop()
    }
  }, 30_000)
})
