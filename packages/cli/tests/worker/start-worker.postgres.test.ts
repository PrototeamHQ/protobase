import { describe, expect, it, vi } from 'vitest'
import { defineJob, unauthorized } from '@protobase/server'
import { startWorker } from '../../src/worker/start-worker'
import type { ServedProject } from '../../src/serve/load-bundle'
import { openPostgresDatabase, postgresTemplateReady } from '../../../../test-support/postgres-database'

const project: ServedProject = { config: {}, authenticate: () => { throw unauthorized('no') } }

// The worker running a project's jobs is proven by the ERP smoke's "runs the jobs in protobase worker"
// (tests/smoke/erp-bundle.test.ts).
describe.skipIf(!(await postgresTemplateReady('empty')))('protobase worker', () => {
  it('refuses a project without jobs, a database or the jobs schema, and drains the pool it made', async () => {
    const job = defineJob({ name: 'nightly', run: () => {} })
    await expect(startWorker({ project })).rejects.toThrow('The bundle has no jobs')
    await expect(startWorker({ project: { ...project, jobs: { job } } })).rejects.toThrow('No database: set DATABASE_URL')
    const { db } = await openPostgresDatabase('empty')
    const destroy = vi.spyOn(db, 'destroy')
    await expect(startWorker({ project: { ...project, jobs: { job } }, databaseUrl: 'postgres://unused/app', createDb: () => db })).rejects.toThrow('The jobs schema is missing')
    expect(destroy).toHaveBeenCalledTimes(1)
  }, 30_000)
})
