import { sql, type Kysely } from 'kysely'
import { expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { defineFunction } from '@protobase/server'
import { startServe } from '../../src/serve/lifecycle'
import { servedConfig } from '../support/served-config'
import { openPostgresDatabase } from '../../../../test-support/postgres-database'

// A view whose rows take longer than the API's second to read.
const slowRows = resource('slow_rows').table('slow_rows').fields({ id: f.integer(), nap: f.text() }).primaryKey((r) => r.id)

const limitOf = async (db: Kysely<any>) => (await sql<{ statement_timeout: string }>`show statement_timeout`.execute(db)).rows[0]!.statement_timeout

const project = {
  config: { slowRows },
  functions: {
    // Its queries have the database's own limit, as the platform sets it for the app's role.
    'nightly-report': defineFunction(async (_request, { db }) => {
      await sql`select pg_sleep(1.5)`.execute(db)
      return Response.json({ done: true })
    }),
    // It opted into long queries, on the connection kept for them.
    'listing-import': defineFunction({ longQueries: true }, async (_request, { db }) => {
      const limit = await limitOf(db)
      await sql`select pg_sleep(1.5)`.execute(db)
      return Response.json({ limit })
    }),
    limit: defineFunction(async (_request, { db }) => Response.json({ limit: await limitOf(db) })),
  },
  authenticate: () => ({ user: { id: 1, roles: ['admin'] } }),
}

const env = { port: 0, requestLog: false, filesCleanupMinutes: 0, runJobs: false, startupChecks: false, dbConnections: 3, trustedProxies: [] }

/**
 * The limits of an app's queries on a real database, reached at the URL `through` gives for a database name: Postgres
 * itself, or a pooler in front of it. The database's role gets the defaults the platform gives an app's login role.
 */
export const longQueryScenarios = (through: (database: string) => string) => {
  it("stops a request's or function's query past its limit with a 504 that names it, and runs a function with longQueries past it", async () => {
    const database = await openPostgresDatabase('empty')
    const name = new URL(database.url).pathname.slice(1)
    await database.exec(`
      alter role current_user in database "${name}" set statement_timeout = '1s';
      alter role current_user in database "${name}" set idle_in_transaction_session_timeout = '1s';
      create view slow_rows as select 1 as id, pg_sleep(1.2)::text as nap;
    `)
    const server = await startServe({ config: servedConfig(project), env: { ...env, databaseUrl: through(name) } })
    const call = async (path: string, init?: RequestInit) => {
      const response = await fetch(`http://localhost:${server.port}${path}`, init)
      return { status: response.status, body: await response.json() }
    }

    expect(await call('/api/v1/slow_rows')).toMatchObject({
      status: 504,
      body: { type: 'urn:protobase:problem:statement-timeout', detail: expect.stringMatching(/^GET \/api\/v1\/slow_rows ran a query longer than 1 s, so the database stopped it\./) },
    })
    expect(await call('/api/functions/nightly-report', { method: 'POST' })).toMatchObject({
      status: 504,
      body: { detail: expect.stringMatching(/^POST \/api\/functions\/nightly-report ran a query longer than the database's statement timeout, .* give it longQueries: true/) },
    })
    expect(await call('/api/functions/listing-import', { method: 'POST' })).toEqual({ status: 200, body: { limit: '30s' } })
    // The function without the option keeps the role's limit, also on a server connection the long one used before.
    expect(await call('/api/functions/limit')).toEqual({ status: 200, body: { limit: '1s' } })
    await server.close()
  }, 30_000)
}
