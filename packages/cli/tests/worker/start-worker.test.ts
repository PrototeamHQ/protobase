import { Kysely } from 'kysely'
import { PGliteDialect } from 'kysely-pglite-dialect'
import { describe, expect, it, vi } from 'vitest'
import { defineJob, unauthorized } from '@protobase/server'
import { startWorker } from '../../src/worker/start-worker'
import type { ServedProject } from '../../src/serve/load-bundle'
import { createJobsPg } from '../../../../test-support/jobs'
import { createEmptyPg } from '../../../../test-support/pglite-snapshot'

const project: ServedProject = { config: {}, authenticate: () => { throw unauthorized('no') } }

describe('protobase worker', () => {
  it("runs the project's jobs, and lets a running one finish when it stops", async () => {
    const db = new Kysely<any>({ dialect: new PGliteDialect(await createJobsPg()) })
    let finished = false
    const job = defineJob({ name: 'slow', run: async () => {
      await new Promise((resolve) => setTimeout(resolve, 200))
      finished = true
    } })
    const worker = await startWorker({ project: { ...project, db, jobs: { job } } })
    try {
      expect(worker.jobs).toBe(1)
      await job.enqueue(db)
      await vi.waitFor(() => expect(finished).toBe(true), { timeout: 20_000, interval: 20 })
    } finally {
      await worker.stop()
    }
  }, 30_000)

  it('refuses a project without jobs, a database or the jobs schema, and drains the pool it made', async () => {
    const job = defineJob({ name: 'nightly', run: () => {} })
    await expect(startWorker({ project })).rejects.toThrow('The bundle has no jobs')
    await expect(startWorker({ project: { ...project, jobs: { job } } })).rejects.toThrow('No database: set DATABASE_URL')
    const db = new Kysely<any>({ dialect: new PGliteDialect(await createEmptyPg()) })
    const destroy = vi.spyOn(db, 'destroy')
    await expect(startWorker({ project: { ...project, jobs: { job } }, databaseUrl: 'postgres://unused/app', createDb: () => db })).rejects.toThrow('The jobs schema is missing')
    expect(destroy).toHaveBeenCalledTimes(1)
  }, 30_000)
})
