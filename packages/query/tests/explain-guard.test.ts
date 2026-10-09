import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { baseQuery } from '../src/base-query'
import { explainGuard } from '../src/explain-guard'
import { check, createTestDb, items } from '../../../test-support/query'

let ctx: Awaited<ReturnType<typeof createTestDb>>
beforeAll(async () => {
  ctx = await createTestDb()
  await ctx.pg.exec('create index items_qty_idx on items (qty); analyze items;')
})
afterAll(async () => { await ctx.db.destroy() })

const guard = (source: string, options = { seqScanRows: 1000, sortRows: 1000 }) =>
  explainGuard(ctx.db, baseQuery(ctx.db, items, check(items, source)).select('t.id'), options)

describe('explainGuard', () => {
  it('flags a sequential scan on an unindexed filter', async () => {
    const report = await guard('name = "item-77"')
    expect(report.ok).toBe(false)
    expect(report.findings).toEqual([expect.objectContaining({ kind: 'seqScan', relation: 'items' })])
  })

  it('passes an indexed filter', async () => {
    expect(await guard('qty = 42')).toEqual({ ok: true, findings: [] })
  })

  it('flags a sort over a large input', async () => {
    const query = baseQuery(ctx.db, items, check(items, 'qty > 5')).select('t.id').orderBy('t.note')
    const report = await explainGuard(ctx.db, query, { seqScanRows: 1_000_000, sortRows: 1000 })
    expect(report.findings).toEqual([expect.objectContaining({ kind: 'sort' })])
  })

  it('ignores scans of tables under the threshold and accepts compiled queries', async () => {
    const compiled = baseQuery(ctx.db, items, check(items, 'name = "x"')).select('t.id').compile()
    expect((await explainGuard(ctx.db, compiled)).ok).toBe(true)
  })

  it('does not execute the query', async () => {
    const report = await explainGuard(ctx.db, sql`select pg_sleep(30)`.compile(ctx.db))
    expect(report.ok).toBe(true)
  })
})
