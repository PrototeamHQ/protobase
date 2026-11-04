import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { sql, type Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { configExports, createAdmin, startJobs, workflowsMigration, type JobsRuntime, type WorkflowsOptions } from '@protobase/server'
import { workflowsModule } from '@protobase/server/internal'
import { openPostgresDatabase, postgresTemplateReady, type PostgresDatabase } from '../../test-support/postgres-database'

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

// A local receiver is a private address, so this app lets the http step reach it, as development does.
const workflows: WorkflowsOptions = { allowPrivateAddresses: true }

describe.skipIf(!(await postgresTemplateReady('jobs')))('the http step of a workflow run on the app\'s jobs', () => {
  let pg: PostgresDatabase
  let db: Kysely<any>
  let admin: ReturnType<typeof createAdmin>
  let runtime: JobsRuntime
  let receiver: Server

  beforeAll(async () => {
    pg = await openPostgresDatabase('jobs')
    db = pg.db
    await pg.exec((await workflowsMigration(db, workflows))!)
    const { resources, views } = configExports(workflowsModule(workflows))
    admin = createAdmin({ resources, views, db, authenticate: () => ({ user: { id: 'ada', roles: ['admin'] }, tenant: '1' }), workflows })
    receiver = createServer((request, response) => {
      if (request.url !== '/big') return response.end('small')
      // Writes 11 MiB, more than the step reads.
      const chunk = Buffer.alloc(1024 * 1024, 'x')
      for (let index = 0; index < 11; index++) response.write(chunk)
      response.end()
    })
    await new Promise<void>((resolve) => receiver.listen(0, '127.0.0.1', resolve))
    runtime = await startJobs({ db, jobs: admin.jobs, pollSeconds: 0.5, shutdownSeconds: 5, onError: (error) => { throw error } })
  })

  afterAll(async () => {
    await runtime?.stop()
    await new Promise((resolve) => receiver?.close(resolve))
    await pg?.close()
  })

  const post = async (path: string, body: unknown) => {
    const response = await admin.request(`/api/v1${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    expect(response.status).toBe(201)
    return (await response.json()).id as string
  }

  it('fails the step with an error saying so when the answer is larger than its limit', async () => {
    const base = `http://127.0.0.1:${(receiver.address() as AddressInfo).port}`
    const workflow = await post('/workflows', {
      name: 'Download',
      definition: { QueryLanguage: 'JSONata', StartAt: 'Get', States: { Get: { Type: 'Task', Resource: 'http', Arguments: { url: '{% $trigger.base & "/big" %}' }, End: true } } },
    })
    const run = await post('/workflow_runs', { workflow_id: workflow, input: { base } })
    const row = async () => (await sql<{ status: string; error: string | null; cause: string | null }>`select status, error, cause from workflows.runs where id = ${run}`.execute(db)).rows[0]!
    await vi.waitFor(async () => expect(['succeeded', 'failed']).toContain((await row()).status), { timeout: 20_000, interval: 50 })
    expect(await row()).toEqual({ status: 'failed', error: 'Http.ResponseTooLarge', cause: "The answer's body is larger than 10 MiB, the most the http step reads" })
    const steps = (await sql<{ status: string; output: unknown }>`select status, output from workflows.steps where run_id = ${run}`.execute(db)).rows
    expect(steps).toEqual([{ status: 'failed', output: null }])
  })
})
