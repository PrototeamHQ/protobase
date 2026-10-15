import { Kysely, sql } from 'kysely'
import { PGliteDialect } from 'kysely-pglite-dialect'
import { describe, expect, it, vi } from 'vitest'
import { defineJob, unauthorized } from '@protobase/server'
import { createJobsPg } from '../../../../test-support/jobs'
import { createEmptyPg } from '../../../../test-support/pglite-snapshot'
import { startServe } from '../../src/serve/lifecycle'
import type { ServedProject } from '../../src/serve/load-bundle'

// From the empty snapshot: a `new PGlite()` runs initdb, which blocks the event loop for seconds on a busy machine.
const pgliteDb = async () => {
  const db = new Kysely<any>({ dialect: new PGliteDialect(await createEmptyPg()) })
  return Object.assign(db, { destroy: vi.fn(() => Kysely.prototype.destroy.call(db)) })
}

// A createDb that hands out one db from the snapshot, created before the server starts.
const dbFactory = async () => {
  const db = await pgliteDb()
  return () => db
}

const project: ServedProject = {
  config: {},
  authenticate: (request) => {
    if (request.headers.get('authorization') !== 'Bearer ok') throw unauthorized('Send a bearer token')
    return { user: { id: 1, roles: ['admin'] } }
  },
}

// Taken before any test serves, since a replaced global stays replaced for the rest of the file.
const { Request, Response } = globalThis

const env = { port: 0, databaseUrl: 'postgres://unused/app', requestLog: false, filesCleanupMinutes: 0, runJobs: true }

describe('startServe', () => {
  it('serves /health without a token and the admin API behind the authenticator', async () => {
    const server = await startServe({ project, env, createDb: await dbFactory() })
    const base = `http://localhost:${server.port}`
    const health = await fetch(`${base}/health`)
    expect(health.status).toBe(200)
    expect(await health.json()).toEqual({ status: 'ok' })
    expect((await fetch(`${base}/api/meta`)).status).toBe(401)
    expect((await fetch(`${base}/api/meta`, { headers: { authorization: 'Bearer ok' } })).status).toBe(200)
    await server.close()
  })

  // Bun's S3 and file writes take the native Response; given another class they store its text, `[object Response]`.
  it("keeps the runtime's own Request and Response after serving a request", async () => {
    const server = await startServe({ project, env, createDb: await dbFactory() })
    expect((await fetch(`http://localhost:${server.port}/health`)).status).toBe(200)
    await server.close()
    expect(globalThis.Response).toBe(Response)
    expect(globalThis.Request).toBe(Request)
  })

  it('creates a pool from DATABASE_URL and drains it after the server stops', async () => {
    const db = await pgliteDb()
    const createDb = vi.fn(() => db)
    const server = await startServe({ project, env, createDb })
    expect(createDb).toHaveBeenCalledWith('postgres://unused/app')
    await server.close()
    expect(db.destroy).toHaveBeenCalledTimes(1)
    await expect(fetch(`http://localhost:${server.port}/health`)).rejects.toThrow()
  })

  it('uses the db the project exports and leaves closing it to the project', async () => {
    const db = await pgliteDb()
    const createDb = vi.fn(() => db)
    const server = await startServe({ project: { ...project, db }, env: { ...env, databaseUrl: undefined }, createDb })
    await server.close()
    expect(createDb).not.toHaveBeenCalled()
    expect(db.destroy).not.toHaveBeenCalled()
    await db.destroy()
  })

  it('needs DATABASE_URL when the project exports no db', async () => {
    await expect(startServe({ project, env: { ...env, databaseUrl: undefined } })).rejects.toThrow('No database: set DATABASE_URL')
  })

  it('drains its pool when the port is taken', async () => {
    const first = await startServe({ project, env, createDb: await dbFactory() })
    const db = await pgliteDb()
    await expect(startServe({ project, env: { ...env, port: first.port }, createDb: () => db })).rejects.toMatchObject({ code: 'EADDRINUSE' })
    expect(db.destroy).toHaveBeenCalledTimes(1)
    await first.close()
  })

  it('refuses to start while the jobs schema is missing, and drains its pool', async () => {
    const db = new Kysely<any>({ dialect: new PGliteDialect(await createEmptyPg()) })
    const destroy = vi.spyOn(db, 'destroy')
    const job = defineJob({ name: 'nightly', run: () => {} })
    await expect(startServe({ project: { ...project, jobs: { job } }, env, createDb: () => db })).rejects.toThrow('The jobs schema is missing')
    expect(destroy).toHaveBeenCalledTimes(1)
  }, 30_000)

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

  it('enqueues but runs no job with PROTOBASE_JOBS=off', async () => {
    const db = new Kysely<any>({ dialect: new PGliteDialect(await createJobsPg()) })
    const run = vi.fn()
    const job = defineJob({ name: 'elsewhere', run })
    const server = await startServe({ project: { ...project, db, jobs: { job } }, env: { ...env, databaseUrl: undefined, runJobs: false } })
    try {
      await job.enqueue(db)
      await new Promise((resolve) => setTimeout(resolve, 500))
      expect(run).not.toHaveBeenCalled()
    } finally {
      await server.close()
    }
  }, 30_000)

  it('drains due jobs for the operator, with POST /api/jobs/drain and the drain token', async () => {
    const db = new Kysely<any>({ dialect: new PGliteDialect(await createJobsPg()) })
    const run = vi.fn()
    const job = defineJob({ name: 'drained', run })
    const server = await startServe({ project: { ...project, db, jobs: { job } }, env: { ...env, databaseUrl: undefined, drainToken: 'operator-token' } })
    const drain = (token?: string, query = '') =>
      fetch(`http://localhost:${server.port}/api/jobs/drain${query}`, { method: 'POST', headers: token ? { authorization: `Bearer ${token}` } : {} })
    try {
      await sql`select jobs.enqueue('drained')`.execute(db)
      expect((await drain()).status).toBe(401)
      expect((await drain('a user token')).status).toBe(401)
      expect((await drain('operator-token', '?seconds=0')).status).toBe(400)
      const drained = await drain('operator-token', '?seconds=20')
      expect(drained.status).toBe(200)
      expect(await drained.json()).toEqual({ drained: true, remaining: 0, nextDue: null })
      expect(run).toHaveBeenCalledTimes(1)
    } finally {
      await server.close()
    }
  }, 30_000)

  it('has no drain endpoint without a drain token, and refuses to drain with PROTOBASE_JOBS=off', async () => {
    const db = new Kysely<any>({ dialect: new PGliteDialect(await createJobsPg()) })
    const job = defineJob({ name: 'elsewhere', run: () => {} })
    const without = await startServe({ project: { ...project, db, jobs: { job } }, env: { ...env, databaseUrl: undefined } })
    try {
      expect((await fetch(`http://localhost:${without.port}/api/jobs/drain`, { method: 'POST', headers: { authorization: 'Bearer ok' } })).status).toBe(404)
    } finally {
      await without.close()
    }
    const off = await startServe({ project: { ...project, db, jobs: { job } }, env: { ...env, databaseUrl: undefined, runJobs: false, drainToken: 't' } })
    try {
      const refused = await fetch(`http://localhost:${off.port}/api/jobs/drain`, { method: 'POST', headers: { authorization: 'Bearer t' } })
      expect(refused.status).toBe(409)
      expect((await refused.json()).detail).toBe('This process runs no jobs (PROTOBASE_JOBS=off); drain the one that does')
    } finally {
      await off.close()
    }
  }, 30_000)
})
