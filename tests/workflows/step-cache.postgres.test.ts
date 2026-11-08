import { sql, type Kysely } from 'kysely'
// Where runs keep their traces.
const trace = await traceFiles()

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { defineRoles } from '@protobase/schema'
import { configExports, createAdmin, startJobs, workflowsMigration, type JobsRuntime, type WorkflowsOptions } from '@protobase/server'
import { workflowsModule } from '@protobase/server/internal'
import type { Plugin } from '@protobase/workflows/plugin'
import { openPostgresDatabase, postgresTemplateReady, type PostgresDatabase } from '../../test-support/postgres-database'
import { traceFiles } from './support/run-trace'

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

const roles = defineRoles<'workflows' | 'workflow_versions' | 'workflow_runs'>({ builder: ['workflows.*', 'workflow_versions.read', 'workflow_runs.*'] })
const secretValue = 'lookup-secret-value-1234'

// A lookup that counts its calls, cached for an hour on what it reads.
const calls: unknown[] = []
const plugin: Plugin = {
  name: 'acme',
  label: 'Acme',
  steps: {
    lookup: {
      label: 'Look up',
      description: 'Looks a word up, slowly.',
      input: { type: 'object' },
      cache: { choice: 'hidden', ttl: '1 hour' },
      run: async ({ input }) => (calls.push(input), { word: input.word, headers: input.headers, n: calls.length }),
    },
  },
}

const definition = (args: Record<string, unknown>) => ({
  trigger: { manual: {} },
  stateMachine: { QueryLanguage: 'JSONata', StartAt: 'Look', States: { Look: { Type: 'Task', Resource: 'acme:lookup', Arguments: args, End: true } } },
})

describe.skipIf(!(await postgresTemplateReady('jobs')))('the step cache on the app\'s database', () => {
  let pg: PostgresDatabase
  let db: Kysely<any>
  let admin: ReturnType<typeof createAdmin>
  let runtime: JobsRuntime | undefined
  const errors: unknown[] = []

  beforeAll(async () => {
    vi.stubEnv('LOOKUP_KEY', secretValue)
    vi.stubEnv('PROTOBASE_SECRET', 'app-secret-for-the-step-cache-test')
    const workflows: WorkflowsOptions = { savedByRoles: async () => ['builder'], plugins: [{ plugin, source: 'acme' }], secrets: ['LOOKUP_KEY'] }
    pg = await openPostgresDatabase('jobs')
    db = pg.db
    await pg.exec((await workflowsMigration(db, workflows))!)
    const { resources, views } = configExports(workflowsModule(workflows))
    admin = createAdmin({ resources, views, db, files: trace.files, authenticate: (request) => ({ user: { id: 'ada', roles: ['builder'] }, tenant: request.headers.get('x-tenant')! }), workflows, options: { roles } })
    runtime = await startJobs({ db, jobs: admin.jobs, pollSeconds: 0.5, shutdownSeconds: 5, onError: (error) => errors.push(error) })
  })

  afterAll(async () => {
    await trace.folder.remove()
    await runtime?.stop()
    await pg?.close()
    vi.unstubAllEnvs()
    expect(errors).toEqual([])
  })

  const as = async (tenant: string, path: string, body: unknown) => {
    const response = await admin.request(`/api/v1${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-tenant': tenant }, body: JSON.stringify(body) })
    if (response.status !== 201) throw new Error(await response.text())
    return (await response.json()).id as string
  }
  const runOf = async (tenant: string, args: Record<string, unknown>) => {
    const workflow = await as(tenant, '/workflows', { name: 'Lookup', definition: definition(args) })
    const id = await as(tenant, '/workflow_runs', { workflow_id: workflow })
    await vi.waitFor(async () => expect((await sql<{ status: string }>`select status from workflows.runs where id = ${id}`.execute(db)).rows[0]!.status).toBe('succeeded'), { timeout: 20_000, interval: 50 })
    return (await trace.steps(db, id))[0] as unknown as { output: { n: number }; logs: { message: string }[] }
  }

  it('serves a second workflow with the same input from the cache, and runs again for another header or tenant', async () => {
    const first = await runOf('1', { word: 'cat', headers: { accept: 'text/plain' } })
    const second = await runOf('1', { word: 'cat', headers: { accept: 'text/plain' } })
    expect(second.output).toEqual(first.output)
    expect(second.logs.map((log) => log.message).join('\n')).toContain('An earlier result from')
    expect((await runOf('1', { word: 'cat', headers: { accept: 'application/json' } })).output.n).not.toBe(first.output.n)
    expect((await runOf('2', { word: 'cat', headers: { accept: 'text/plain' } })).output.n).not.toBe(first.output.n)
  })

  it('keeps a secret it was given by its name and a fingerprint, never its value', async () => {
    await runOf('1', { word: 'dog', headers: { authorization: '{% "Bearer " & $states.context.Secrets.LOOKUP_KEY %}' } })
    const { rows } = await sql<{ text: string }>`select (key || who::text || output::text || secrets::text) as text from workflows.step_cache`.execute(db)
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) expect(row.text).not.toContain(secretValue)
    const kept = (await sql<{ secrets: Record<string, string> }>`select secrets from workflows.step_cache where secrets ? 'LOOKUP_KEY'`.execute(db)).rows
    expect(kept).toHaveLength(1)
  })
})
