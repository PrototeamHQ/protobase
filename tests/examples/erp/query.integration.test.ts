import { Kysely } from 'kysely'
import { afterAll, describe, expect, it } from 'vitest'
import { compileFilter, estimateCount, exactCount, explainGuard, facetCounts, seekToPosition } from '@protobase/query'
import { connect } from '../../../examples/erp/db/connection'
import { PostgresJsDialect } from './kysely-postgres-js'
import { allOrders, allStockMoves, check, orders, stockMoves } from './erp-models'
import { databaseReachable } from './reachable'

const reachable = await databaseReachable()
const pg = connect({ max: 4 })
const db = new Kysely<any>({ dialect: new PostgresJsDialect(pg) })
afterAll(async () => {
  await db.destroy()
  await pg.end()
})

const scope = { tenantValue: 1 }
const rows = async (query: string) => [...(await pg.unsafe(query))]

// What PGlite cannot show: a real statement_timeout, parallel plans, statistics on a million rows. Paging and AIP-160
// filters are @protobase/query's tests.
describe.skipIf(!reachable)('query layer against the seeded erp database', async () => {
  const [{ scale }] = reachable ? await pg`select scale from public.seed_info order by seeded_at desc limit 1` : [{ scale: 'medium' }]
  const medium = scale === 'medium'

  it('cancels a slow facet count with statement_timeout', async () => {
    const slow = facetCounts(db, stockMoves, 'reference', undefined, { statementTimeoutMs: 5, scope })
    await expect(slow).rejects.toThrow(/statement timeout/)
    const generous = await facetCounts(db, stockMoves, 'kind', undefined, { statementTimeoutMs: 120_000, scope })
    expect(generous.length).toBeGreaterThan(0)
  })

  describe('explainGuard on inventory.stock_moves', () => {
    const plan = (source: string) =>
      explainGuard(db, db.selectFrom('inventory.stock_moves as t').select('t.id').where(compileFilter(allStockMoves, check(allStockMoves, source))))

    it.skipIf(!medium)('passes an indexed filter', async () => {
      const report = await plan('moved_at >= "2026-09-01T00:00:00Z" AND moved_at <= "2026-09-02T00:00:00Z"')
      expect(report).toEqual({ ok: true, findings: [] })
    })

    it.skipIf(!medium)('fails an unindexed filter', async () => {
      const report = await plan('reference = "no-such-reference"')
      expect(report.ok).toBe(false)
      expect(report.findings).toEqual([expect.objectContaining({ kind: 'seqScan', relation: 'stock_moves' })])
    })
  })

  describe('sales.orders', () => {
    it('estimates close to the exact count', async () => {
      const exact = await exactCount(db, allOrders)
      const tableWide = await estimateCount(db, allOrders)
      expect(Math.abs(tableWide - exact)).toBeLessThan(exact * 0.05)
      const filter = check(orders, 'status = "shipped"')
      const estimate = await estimateCount(db, orders, filter, scope)
      const filteredExact = await exactCount(db, orders, filter, scope)
      expect(estimate).toBeGreaterThan(filteredExact * 0.5)
      expect(estimate).toBeLessThan(filteredExact * 2)
    })
  })

  describe.skipIf(!medium)('seekToPosition on inventory.stock_moves.moved_at', () => {
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
