import { sql } from 'kysely'
import { describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { defineFunction } from '@protobase/server'
import { startServe } from '../../src/serve/lifecycle'
import type { ServedProject } from '../../src/serve/load-bundle'
import { openPostgresDatabase, postgresTemplateReady } from '../../../../test-support/postgres-database'

const tickets = resource('tickets').table('tickets').fields({ id: f.integer(), title: f.text() }).primaryKey((r) => r.id)

// An import that holds its connection, as a long insert does.
const slowImport = defineFunction(async (_request, { db }) => {
  await sql`select pg_sleep(2)`.execute(db)
  return Response.json({ imported: true })
})

const project: ServedProject = {
  config: { tickets },
  functions: { 'listing-import': slowImport },
  authenticate: () => ({ user: { id: 1, roles: ['admin'] } }),
}

const env = { port: 0, requestLog: false, filesCleanupMinutes: 0, runJobs: false, startupChecks: false, dbConnections: 3 }

describe.skipIf(!(await postgresTemplateReady('empty')))('the pool protobase serve creates', () => {
  it('keeps a connection for requests while function calls hold all of theirs', async () => {
    const database = await openPostgresDatabase('empty')
    await database.exec("create table tickets (id integer primary key, title text not null); insert into tickets values (1, 'Leaking roof')")
    const server = await startServe({ project, env: { ...env, databaseUrl: database.url } })
    const base = `http://localhost:${server.port}`
    const finished: string[] = []

    // Three imports for the two connections functions may hold: two sleep, the third waits for one of them.
    const imports = [1, 2, 3].map(() => fetch(`${base}/api/functions/listing-import`, { method: 'POST' }).then((response) => {
      finished.push('import')
      return response.status
    }))
    const sleeping = async () => (await sql<{ count: number }>`select count(*)::int as count from pg_stat_activity where datname = current_database() and query like 'select pg_sleep%'`.execute(database.db)).rows[0]!.count
    await expect.poll(sleeping).toBe(2)

    const page = await fetch(`${base}/api/v1/tickets`)
    finished.push('page')
    expect(page.status).toBe(200)
    expect((await page.json()).items).toEqual([expect.objectContaining({ title: 'Leaking roof' })])
    expect(await Promise.all(imports)).toEqual([200, 200, 200])
    expect(finished).toEqual(['page', 'import', 'import', 'import'])
    await server.close()
  }, 30_000)
})
