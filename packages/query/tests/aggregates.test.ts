import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { QueryError } from '../src/errors'
import { estimateCount } from '../src/estimate-count'
import { exactCount } from '../src/exact-count'
import { facetCounts } from '../src/facet-counts'
import { histogram } from '../src/histogram'
import { series } from '../src/series'
import { check, createTestDb, items, orderLines } from '../../../test-support/query'

let ctx: Awaited<ReturnType<typeof createTestDb>>
beforeAll(async () => { ctx = await createTestDb() })
afterAll(async () => { await ctx.db.destroy() })

const sqlRows = async <T>(text: string) => (await ctx.pg.query<T>(text)).rows
const sqlCount = async (text: string) => Number((await sqlRows<{ n: string }>(`select count(*)::text n from ${text}`))[0]!.n)

describe('counts', () => {
  it('unfiltered estimate reads reltuples', async () => {
    expect(await estimateCount(ctx.db, orderLines)).toBe(10000)
  })

  it('filtered estimate comes from the planner', async () => {
    const filter = check(orderLines, 'qty = 3')
    const estimate = await estimateCount(ctx.db, orderLines, filter)
    const exact = await exactCount(ctx.db, orderLines, filter)
    expect(exact).toBe(await sqlCount('order_lines where qty = 3'))
    expect(estimate).toBeGreaterThan(exact * 0.5)
    expect(estimate).toBeLessThan(exact * 2)
  })

  it('estimates tables with soft delete through the planner', async () => {
    expect(Math.abs((await estimateCount(ctx.db, items)) - 9800)).toBeLessThan(200)
  })

  it('exact count excludes soft-deleted rows', async () => {
    expect(await exactCount(ctx.db, items)).toBe(9800)
    expect(await exactCount(ctx.db, items, check(items, 'category = "red"'))).toBe(
      await sqlCount(`items where category = 'red' and deleted_at is null`),
    )
  })
})

describe('facetCounts', () => {
  const filter = check(items, 'in(category, "red") AND active = true')

  it('excludes the facet field own filter but keeps the others', async () => {
    const facets = await facetCounts(ctx.db, items, 'category', filter, { statementTimeoutMs: 5000 })
    const expected = await sqlRows<{ category: string; n: string }>(
      `select category, count(*)::text n from items where active and deleted_at is null group by 1 order by count(*) desc, category`,
    )
    expect(facets).toEqual(expected.map(row => ({ value: row.category, count: Number(row.n) })))
    expect(facets.map(f => f.value).sort()).toEqual(['blue', 'green', 'red'])
  })

  it('still applies the facet field filter to other facets', async () => {
    const facets = await facetCounts(ctx.db, items, 'active', filter, { statementTimeoutMs: 5000 })
    expect(facets.reduce((sum, f) => sum + f.count, 0)).toBe(await sqlCount(`items where category = 'red' and deleted_at is null`))
  })

  it('limits groups and rejects bad options', async () => {
    expect(await facetCounts(ctx.db, items, 'qty', undefined, { statementTimeoutMs: 5000, limit: 5 })).toHaveLength(5)
    await expect(facetCounts(ctx.db, items, 'qty', undefined, { statementTimeoutMs: 0 })).rejects.toBeInstanceOf(QueryError)
    await expect(facetCounts(ctx.db, items, 'secret', undefined, { statementTimeoutMs: 5000 })).rejects.toMatchObject({ code: 'not_filterable' })
  })
})

describe('series', () => {
  const one = check(items, 'name = "item-1"')
  const range = { from: '2024-01-01T00:00:00Z', to: '2024-01-06T00:00:00Z' }

  it('fills empty buckets with zero', async () => {
    const points = await series(ctx.db, items, 'created_at', { range, granularity: 'day', filter: one })
    expect(points).toEqual([
      { bucket: '2024-01-01T00:00:00', count: 0 },
      { bucket: '2024-01-02T00:00:00', count: 1 },
      { bucket: '2024-01-03T00:00:00', count: 0 },
      { bucket: '2024-01-04T00:00:00', count: 0 },
      { bucket: '2024-01-05T00:00:00', count: 0 },
    ])
  })

  it('buckets in the requested time zone', async () => {
    // item-1 is created 2024-01-02 01:00Z, which is Jan 1 20:00 in New York
    const points = await series(ctx.db, items, 'created_at', {
      range: { from: '2024-01-01T05:00:00Z', to: '2024-01-06T05:00:00Z' },
      granularity: 'day',
      timeZone: 'America/New_York',
      filter: one,
    })
    expect(points.map(p => p.count)).toEqual([1, 0, 0, 0, 0])
    expect(points[0]?.bucket).toBe('2024-01-01T00:00:00')
  })

  it('counts every row once across monthly buckets and spans hourly buckets', async () => {
    const monthly = await series(ctx.db, items, 'created_at', { range: { from: '2024-01-01T00:00:00Z', to: '2025-03-01T00:00:00Z' }, granularity: 'month' })
    expect(monthly).toHaveLength(14)
    expect(monthly.reduce((sum, p) => sum + p.count, 0)).toBe(9800)
    const hourly = await series(ctx.db, items, 'created_at', { range: { from: '2024-01-01T00:00:00Z', to: '2024-01-02T00:00:00Z' }, granularity: 'hour', filter: one })
    expect(hourly).toHaveLength(24)
  })

  it('works on date fields', async () => {
    const points = await series(ctx.db, items, 'born', { range: { from: '2024-01-01', to: '2024-01-04' }, granularity: 'day' })
    expect(points.map(p => p.bucket)).toEqual(['2024-01-01T00:00:00', '2024-01-02T00:00:00', '2024-01-03T00:00:00'])
    expect(points.map(p => p.count)).toEqual([0, 25, 25])
  })

  it('rejects bad input', async () => {
    const code = (field: string, options: Partial<Parameters<typeof series>[3]>) =>
      series(ctx.db, items, field, { range, granularity: 'day', ...options }).catch(error => error.code)
    expect(await code('qty', {})).toBe('unsupported_field_type')
    expect(await code('created_at', { granularity: 'decade' as never })).toBe('invalid_option')
    expect(await code('created_at', { timeZone: 'Mars/Base' })).toBe('invalid_option')
    expect(await code('created_at', { range: { from: range.to, to: range.from } })).toBe('invalid_option')
    expect(await code('created_at', { range: { from: '2000-01-01', to: '2030-01-01' }, granularity: 'hour' })).toBe('invalid_option')
  })
})

describe('histogram', () => {
  it('counts per bucket with min and max', async () => {
    const result = await histogram(ctx.db, items, 'qty', undefined, 10)
    expect(result.min).toBe(1)
    expect(result.max).toBe(99)
    expect(result.buckets).toHaveLength(10)
    expect(result.buckets.reduce((sum, b) => sum + b.count, 0)).toBe(9800)
    expect(result.buckets[0]).toMatchObject({ from: 1 })
    expect(result.buckets.at(-1)?.to).toBe(99)
  })

  it('applies filters and handles empty and single-value results', async () => {
    const some = await histogram(ctx.db, items, 'qty', check(items, 'qty >= 10 AND qty <= 19'), 5)
    expect(some.min).toBe(10)
    expect(some.max).toBe(19)
    expect(some.buckets.reduce((sum, b) => sum + b.count, 0)).toBe(await sqlCount('items where qty between 10 and 19 and deleted_at is null'))
    expect(await histogram(ctx.db, items, 'qty', check(items, 'qty > 1000'), 5)).toEqual({ min: null, max: null, buckets: [] })
    const single = await histogram(ctx.db, items, 'qty', check(items, 'qty = 7'), 5)
    expect(single.buckets).toHaveLength(1)
    expect(single.buckets[0]?.count).toBeGreaterThan(0)
  })

  it('works on decimals and rejects non-numeric fields and bad bucket counts', async () => {
    expect((await histogram(ctx.db, items, 'price', undefined, 4)).buckets).toHaveLength(4)
    await expect(histogram(ctx.db, items, 'name', undefined, 4)).rejects.toMatchObject({ code: 'unsupported_field_type' })
    await expect(histogram(ctx.db, items, 'qty', undefined, 0)).rejects.toMatchObject({ code: 'invalid_option' })
  })
})
