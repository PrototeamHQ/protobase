import { Kysely } from 'kysely'
import { afterAll, describe, expect, it } from 'vitest'
import { estimateCount, exactCount, seekToPosition } from '@protobase/query'
import { connect } from '../../examples/erp/db/connection'
import { PostgresJsDialect } from '../examples/erp/kysely-postgres-js'
import { allOrders, allStockMoves, check, orders, stockMoves } from '../examples/erp/erp-models'
import { databaseReachable } from '../examples/erp/reachable'

const reachable = await databaseReachable()
const pg = connect({ max: 4 })
const db = new Kysely<any>({ dialect: new PostgresJsDialect(pg) })
afterAll(async () => {
  await db.destroy()
  await pg.end()
})

const scope = { tenantValue: 1 }
const rows = async (query: string) => [...(await pg.unsafe(query))]

// What only statistics on a million rows show: the planner's estimates and seeking by them, on the ERP at the medium
// scale the Postgres suite's template has.
describe.skipIf(!reachable)('query statistics on the medium erp database', () => {
  it('estimates sales.orders close to the exact count', async () => {
    const exact = await exactCount(db, allOrders)
    const tableWide = await estimateCount(db, allOrders)
    expect(Math.abs(tableWide - exact)).toBeLessThan(exact * 0.05)
    const filter = check(orders, 'status = "shipped"')
    const estimate = await estimateCount(db, orders, filter, scope)
    const filteredExact = await exactCount(db, orders, filter, scope)
    expect(estimate).toBeGreaterThan(filteredExact * 0.5)
    expect(estimate).toBeLessThan(filteredExact * 2)
  })

  describe('seekToPosition on inventory.stock_moves.moved_at', () => {
    it('lands near the requested position in statistics mode', async () => {
      const total = await estimateCount(db, allStockMoves)
      expect(total).toBeGreaterThan(100_000)
      const target = Math.round(total / 2)
      const page = await seekToPosition(db, allStockMoves, { position: target, orderBy: [['moved_at', 'asc']], columns: ['moved_at'], limit: 1 })
      const [{ below } = { below: 0 }] = await rows(`select count(*)::int below from inventory.stock_moves where moved_at < '${(page.rows[0]!.moved_at as Date).toISOString()}'`)
      expect(Math.abs(below - target)).toBeLessThan(total * 0.03)
    })

    it('stays inside the tenant for a scoped caller', async () => {
      const page = await seekToPosition(db, stockMoves, { position: 1000, orderBy: [['moved_at', 'desc']], columns: ['id', 'organization_id'], limit: 200 }, scope)
      expect(page.rows).toHaveLength(200)
      expect(page.rows.every(row => row.organization_id === 1)).toBe(true)
    })
  })
})
