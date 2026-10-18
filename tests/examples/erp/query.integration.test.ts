import { Kysely } from 'kysely'
import { afterAll, describe, expect, it } from 'vitest'
import { facetCounts, tableIndexes, uncoveredColumns } from '@protobase/query'
import { connect } from '../../../examples/erp/db/connection'
import { PostgresJsDialect } from './kysely-postgres-js'
import { check, stockMoves } from './erp-models'
import { databaseReachable } from './reachable'

const reachable = await databaseReachable()
const pg = connect({ max: 4 })
const db = new Kysely<any>({ dialect: new PostgresJsDialect(pg) })
afterAll(async () => {
  await db.destroy()
  await pg.end()
})

const scope = { tenantValue: 1 }

// What PGlite cannot show: a real statement_timeout and the indexes of a real catalog. Paging and AIP-160 filters are
// @protobase/query's tests; statistics on a million rows are the Postgres suite's (tests/postgres/erp-statistics.test.ts).
describe.skipIf(!reachable)('query layer against the seeded erp database', () => {
  it('cancels a slow facet count with statement_timeout', async () => {
    const slow = facetCounts(db, stockMoves, 'reference', undefined, { statementTimeoutMs: 5, scope })
    await expect(slow).rejects.toThrow(/statement timeout/)
    const generous = await facetCounts(db, stockMoves, 'kind', undefined, { statementTimeoutMs: 120_000, scope })
    expect(generous.length).toBeGreaterThan(0)
  })

  describe('uncoveredColumns on inventory.stock_moves', () => {
    const uncovered = async (source: string) => uncoveredColumns(stockMoves, await tableIndexes(db, stockMoves), { filter: check(stockMoves, source) }, scope)

    it('passes an indexed filter, the tenant pinning the first key of (organization_id, quantity)', async () => {
      expect(await uncovered('moved_at >= "2026-09-01T00:00:00Z" AND quantity > 5')).toEqual([])
    })

    it('names an unindexed column and the index to add', async () => {
      expect(await uncovered('reference = "no-such-reference"')).toEqual([
        expect.objectContaining({ field: 'reference', suggestion: 'create index on "inventory"."stock_moves" ("reference")' }),
      ])
    })
  })
})
