import { Kysely } from 'kysely'
import { PGliteDialect } from 'kysely-pglite-dialect'
import { describe, expect, it, vi } from 'vitest'
import { defineJob, unauthorized } from '@protobase/server'
import { createJobsPg } from '../../../../test-support/jobs'
import { startServe } from '../../src/serve/lifecycle'
import type { ServedProject } from '../../src/serve/load-bundle'

// The one startServe test that waits for a worker to poll, which a recording cannot replay; still on PGlite, and
// proven on real Postgres by serve.integration's "runs the app's jobs".

const project: ServedProject = {
  config: {},
  authenticate: (request) => {
    if (request.headers.get('authorization') !== 'Bearer ok') throw unauthorized('Send a bearer token')
    return { user: { id: 1, roles: ['admin'] } }
  },
}

const env = { port: 0, databaseUrl: 'postgres://unused/app', requestLog: false, filesCleanupMinutes: 0, runJobs: true, startupChecks: true }

describe('startServe', () => {
  it("runs the project's jobs, and lets a running one finish when it closes", async () => {
    const db = new Kysely<any>({ dialect: new PGliteDialect(await createJobsPg()) })
    let finished = false
    let started = false
    const job = defineJob({ name: 'slow', run: async () => {
      started = true
      await new Promise((resolve) => setTimeout(resolve, 200))
      finished = true
    } })
    const server = await startServe({ project: { ...project, db, jobs: { job } }, env: { ...env, databaseUrl: undefined } })
    try {
      await job.enqueue(db)
      await vi.waitFor(() => expect(started).toBe(true), { timeout: 20_000, interval: 20 })
    } finally {
      await server.close()
    }
    expect(finished).toBe(true)
    await expect(job.enqueue(db)).rejects.toThrow('Jobs are not running in this process')
  }, 30_000)

})
