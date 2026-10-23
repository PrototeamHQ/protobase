import { sql } from 'kysely'
import { describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { defineFunction } from '@protobase/server'
import { startServe } from '../../src/serve/lifecycle'
import type { ServedProject } from '../../src/serve/load-bundle'
import { databaseUrl } from '../../../../scripts/test-db/templates'
import { openPostgresDatabase, postgresTemplateReady } from '../../../../test-support/postgres-database'
import { longQueryScenarios } from './long-queries-scenarios'

const tickets = resource('tickets').table('tickets').fields({ id: f.integer(), title: f.text() }).primaryKey((r) => r.id)

// An import that holds the app's only connection for longer than a request waits for one.
const project: ServedProject = {
  config: { tickets },
  functions: {
    'listing-import': defineFunction(async (_request, { db }) => {
      await sql`select pg_sleep(3)`.execute(db)
      return Response.json({ imported: true })
    }),
  },
  authenticate: () => ({ user: { id: 1, roles: ['admin'] } }),
}

const env = { port: 0, requestLog: false, filesCleanupMinutes: 0, runJobs: false, startupChecks: false, dbConnections: 1, trustedProxies: [] }

describe.skipIf(!(await postgresTemplateReady('empty')))('the limits of the queries protobase serve runs, on Postgres', () => {
  longQueryScenarios((database) => databaseUrl(database))

  it('answers a request that finds every connection busy for 2 s with a 503 that names it', async () => {
    const database = await openPostgresDatabase('empty')
    await database.exec("create table tickets (id integer primary key, title text not null); insert into tickets values (1, 'Leaking roof')")
    const server = await startServe({ project, env: { ...env, databaseUrl: database.url } })
    const base = `http://localhost:${server.port}`
    const sleeping = async () => (await sql<{ count: number }>`select count(*)::int as count from pg_stat_activity where datname = current_database() and query like 'select pg_sleep%'`.execute(database.db)).rows[0]!.count

    const importing = fetch(`${base}/api/functions/listing-import`, { method: 'POST' })
    await expect.poll(sleeping).toBe(1)
    const page = await fetch(`${base}/api/v1/tickets`)
    expect(page.status).toBe(503)
    expect(page.headers.get('retry-after')).toBe('1')
    expect((await page.json()).detail).toBe("GET /api/v1/tickets waited 2 s for one of the app's 1 database connections, which all stayed busy, so it did not run. Queries that run long or transactions left open hold them.")
    expect((await importing).status).toBe(200)
    expect((await fetch(`${base}/api/v1/tickets`)).status).toBe(200)
    await server.close()
  }, 30_000)
})
