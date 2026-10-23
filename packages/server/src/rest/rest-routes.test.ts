import { Kysely, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler, type DatabaseConnection, type Driver } from 'kysely'
import { describe, expect, it, vi } from 'vitest'
import { buildRegistry } from '../registry'
import { createScanGuard } from '../scan-guard'
import { restRoutes } from './rest-routes'

// A database whose every statement Postgres stops at its statement timeout.
const stoppingDb = () => {
  const stopped = Object.assign(new Error('canceling statement due to statement timeout'), { code: '57014' })
  const connection: DatabaseConnection = {
    executeQuery: () => Promise.reject(stopped),
    streamQuery: () => {
      throw new Error('Not implemented: nothing streams here')
    },
  }
  const driver: Driver = {
    init: async () => {},
    acquireConnection: async () => connection,
    beginTransaction: async () => {},
    commitTransaction: async () => {},
    rollbackTransaction: async () => {},
    releaseConnection: async () => {},
    destroy: async () => {},
  }
  return new Kysely<any>({
    dialect: { createAdapter: () => new PostgresAdapter(), createDriver: () => driver, createIntrospector: (k) => new PostgresIntrospector(k), createQueryCompiler: () => new PostgresQueryCompiler() },
  })
}

describe('restRoutes on a query stopped at its statement timeout', () => {
  it("keeps PostgREST's error, with a hint that names the request, its limit and the ways out, and reports it", async () => {
    const db = stoppingDb()
    const report = vi.fn()
    const app = restRoutes({ deps: { db, registry: buildRegistry([]), statementTimeoutMs: 1_000, guard: createScanGuard(db) }, caller: async () => ({ role: 'anon', claims: { role: 'anon' } }), report })
    const response = await app.request('/rpc/monthly_totals')
    expect(response.status).toBe(500)
    const body = await response.json()
    expect(body).toEqual({
      code: '57014',
      details: null,
      message: 'canceling statement due to statement timeout',
      hint: 'GET /rpc/monthly_totals ran a query longer than 1 s, so the database stopped it. Make the query faster, such as with an index or a narrower filter, or move the work into a function or job with longQueries: true, whose queries may run up to 30 s.',
    })
    expect(report).toHaveBeenCalledWith(expect.objectContaining({ status: 504, message: body.hint }), expect.any(Request))
  })
})
