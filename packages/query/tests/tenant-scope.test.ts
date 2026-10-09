import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { estimateCount } from '../src/estimate-count'
import { exactCount } from '../src/exact-count'
import { facetCounts } from '../src/facet-counts'
import { histogram } from '../src/histogram'
import { listQuery } from '../src/list-query'
import { scrollAnchors } from '../src/scroll-anchors'
import { series } from '../src/series'
import { check, createTestDb, field, model } from '../../../test-support/query'

const tenanted = model('tenanted', ['id'], [
  field('id', 'integer'),
  field('org', 'integer'),
  field('qty', 'integer'),
  field('kind', 'text'),
  field('at', 'timestamp'),
], { tenant: 'org' })

let ctx: Awaited<ReturnType<typeof createTestDb>>
beforeAll(async () => {
  ctx = await createTestDb()
  await ctx.pg.exec(`
    create table tenanted (id integer primary key, org integer not null, qty integer not null, kind text not null, at timestamptz not null);
    insert into tenanted select i, 1 + i % 2, i % 10, 'k' || (i % 3), timestamptz '2024-01-01+00' + (i % 5) * interval '1 day' from generate_series(1, 2000) i;
    analyze tenanted;
  `)
})
afterAll(async () => { await ctx.db.destroy() })

const scope = { tenantValue: 2 }
const missing = { code: 'missing_tenant' }

describe('tenant scope', () => {
  it('lists only the tenant rows, before and with a user filter', async () => {
    const all = await listQuery(ctx.db, tenanted, { limit: 500, columns: ['id', 'org'] }, scope)
    expect(all.rows.every(row => row.org === 2)).toBe(true)
    const filtered = await listQuery(ctx.db, tenanted, { limit: 500, columns: ['org'], filter: check(tenanted, 'org = 1 OR qty = 3') }, scope)
    expect(filtered.rows.length).toBeGreaterThan(0)
    expect(filtered.rows.every(row => row.org === 2)).toBe(true)
  })

  it('pages through exactly the tenant rows', async () => {
    const seen: unknown[] = []
    let cursor: string | undefined
    do {
      const result = await listQuery(ctx.db, tenanted, { limit: 120, cursor, sort: [['qty', 'desc']], columns: ['id'] }, scope)
      seen.push(...result.rows.map(row => row.id))
      cursor = result.nextCursor ?? undefined
    } while (cursor)
    const expected = await ctx.pg.query<{ id: number }>('select id from tenanted where org = 2 order by qty desc, id desc')
    expect(seen).toEqual(expected.rows.map(row => row.id))
  })

  it('scopes counts', async () => {
    expect(await exactCount(ctx.db, tenanted, undefined, scope)).toBe(1000)
    expect(await exactCount(ctx.db, tenanted, check(tenanted, 'qty = 3'), scope)).toBe(200)
    expect(Math.abs((await estimateCount(ctx.db, tenanted, undefined, scope)) - 1000)).toBeLessThan(100)
  })

  it('scopes facets, series and histograms', async () => {
    const facets = await facetCounts(ctx.db, tenanted, 'kind', undefined, { statementTimeoutMs: 5000, scope })
    expect(facets.reduce((sum, f) => sum + f.count, 0)).toBe(1000)
    const points = await series(ctx.db, tenanted, 'at', { range: { from: '2024-01-01T00:00:00Z', to: '2024-01-06T00:00:00Z' }, granularity: 'day', scope })
    expect(points.reduce((sum, p) => sum + p.count, 0)).toBe(1000)
    const bins = await histogram(ctx.db, tenanted, 'qty', undefined, 5, scope)
    expect(bins.buckets.reduce((sum, b) => sum + b.count, 0)).toBe(1000)
  })

  it('scopes scroll anchors and seeks', async () => {
    const anchors = await scrollAnchors(ctx.db, tenanted, 'qty', { scope })
    expect(anchors.mode).toBe('exact')
    expect(anchors.totalRows).toBe(1000)
    const cursor = await anchors.seekToPosition(500)
    const page = await listQuery(ctx.db, tenanted, { limit: 2, cursor, sort: [['qty', 'asc']], columns: ['id'] }, scope)
    const expected = await ctx.pg.query<{ id: number }>('select id from tenanted where org = 2 order by qty, id offset 500 limit 2')
    expect(page.rows.map(r => r.id)).toEqual(expected.rows.map(r => r.id))
  })

  it('throws when a tenant model is queried without a scope', async () => {
    const range = { from: '2024-01-01T00:00:00Z', to: '2024-01-06T00:00:00Z' }
    await expect(listQuery(ctx.db, tenanted, { limit: 5 })).rejects.toMatchObject(missing)
    await expect(exactCount(ctx.db, tenanted)).rejects.toMatchObject(missing)
    await expect(estimateCount(ctx.db, tenanted)).rejects.toMatchObject(missing)
    await expect(facetCounts(ctx.db, tenanted, 'kind', undefined, { statementTimeoutMs: 5000 })).rejects.toMatchObject(missing)
    await expect(series(ctx.db, tenanted, 'at', { range, granularity: 'day' })).rejects.toMatchObject(missing)
    await expect(histogram(ctx.db, tenanted, 'qty', undefined, 5)).rejects.toMatchObject(missing)
    await expect(scrollAnchors(ctx.db, tenanted, 'qty')).rejects.toMatchObject(missing)
  })

  it('ignores scope for models without a tenant', async () => {
    const plain = model('tenanted', ['id'], [field('id', 'integer')])
    expect((await listQuery(ctx.db, plain, { limit: 1 }, scope)).rows).toHaveLength(1)
  })
})
