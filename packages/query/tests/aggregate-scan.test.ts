import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { KyselyPlugin } from 'kysely'
import { aggregateScan } from '../src/aggregate-scan'
import { facetCounts } from '../src/facet-counts'
import { setsPerScan } from '../src/grouped-counts'
import { histogram } from '../src/histogram'
import { series } from '../src/series'
import { check, createTestDb, field, model } from '../../../test-support/query'

const homes = model('homes', ['id'], [
  field('id', 'integer'),
  field('kind', 'enum', { enumValues: ['flat', 'house', 'villa'] }),
  field('garden', 'boolean', { nullable: true }),
  field('rooms', 'integer'),
  field('price', 'decimal', { nullable: true }),
  field('rent', 'decimal', { nullable: true }),
  field('listed_at', 'timestamp'),
])

let ctx: Awaited<ReturnType<typeof createTestDb>>
beforeAll(async () => {
  ctx = await createTestDb({ seed: false })
  // Every fourth home has no price and every third no garden; one rent for all, so its histogram has one value
  await ctx.pg.exec(`
    create table homes (id integer primary key, kind text not null, garden boolean, rooms integer not null, price numeric, rent numeric, listed_at timestamptz not null);
    insert into homes
    select i, (array['flat','house','villa'])[1 + i % 3], case when i % 3 = 0 then null else i % 2 = 0 end, 1 + i % 5,
      case when i % 4 = 0 then null else 100000 + (i * 7919) % 400000 end, case when i % 2 = 0 then 900 end,
      timestamptz '2026-07-01 00:00:00+00' + (i % 31) * interval '1 day' + (i % 24) * interval '1 hour'
    from generate_series(1, 120) i;
  `)
})
afterAll(async () => { await ctx.db.destroy() })

const range = { from: '2026-07-01T00:00:00Z', to: '2026-08-01T00:00:00Z' }
// On fields no facet counts, so each facet's own method reads the same rows
const filters = ['', 'price < 300000 OR rent = 900', 'listed_at >= "2026-07-10T00:00:00Z" AND price >= 150000']

describe('aggregateScan', () => {
  it.each(filters)('answers each read as its own method does, with filter "%s"', async (source) => {
    const filter = source ? check(homes, source) : undefined
    const scan = await aggregateScan(ctx.db, homes, filter, undefined, {
      facets: [{ field: 'kind', limit: 2 }, { field: 'garden' }, { field: 'rooms' }],
      histograms: [{ field: 'price', buckets: 8 }, { field: 'price', buckets: 1 }, { field: 'rent', buckets: 8 }],
      series: [{ field: 'listed_at', range, granularity: 'week', timeZone: 'Europe/Amsterdam' }],
    })
    expect(scan.facets).toEqual([
      await facetCounts(ctx.db, homes, 'kind', filter, { statementTimeoutMs: 5000, limit: 2 }),
      await facetCounts(ctx.db, homes, 'garden', filter, { statementTimeoutMs: 5000 }),
      await facetCounts(ctx.db, homes, 'rooms', filter, { statementTimeoutMs: 5000 }),
    ])
    expect(scan.histograms).toEqual([
      await histogram(ctx.db, homes, 'price', filter, 8),
      await histogram(ctx.db, homes, 'price', filter, 1),
      await histogram(ctx.db, homes, 'rent', filter, 8),
    ])
    expect(scan.series).toEqual([await series(ctx.db, homes, 'listed_at', { range, granularity: 'week', timeZone: 'Europe/Amsterdam', ...(filter && { filter }) })])
  })

  it('leaves the rows without a value out of a histogram', async () => {
    const [prices] = (await aggregateScan(ctx.db, homes, undefined, undefined, { histograms: [{ field: 'price', buckets: 4 }] })).histograms
    expect(prices!.buckets.reduce((sum, bucket) => sum + bucket.count, 0)).toBe(90)
  })

  it('reads the table once for the bounds and once per four groupings', async () => {
    let statements = 0
    // Once per statement sent: a query built into another one is transformed with it but answered once
    const counting: KyselyPlugin = { transformQuery: ({ node }) => node, transformResult: async ({ result }) => (statements++, result) }
    const facets = ['kind', 'garden', 'rooms', 'id'].map((name) => ({ field: name }))
    await aggregateScan(ctx.db.withPlugin(counting), homes, undefined, undefined, { facets, histograms: [{ field: 'price', buckets: 8 }], series: [{ field: 'listed_at', range, granularity: 'day' }] })
    // The bounds, 6 groupings in scans of 4, and the series' buckets, which read no table
    expect(setsPerScan).toBe(4)
    expect(statements).toBe(1 + 2 + 1)
  })

  it('counts a field asked for twice once, each keeping its own limit', async () => {
    const scan = await aggregateScan(ctx.db, homes, undefined, undefined, { facets: [{ field: 'rooms', limit: 2 }, { field: 'rooms' }] })
    expect(scan.facets[0]).toEqual(scan.facets[1]!.slice(0, 2))
    expect(scan.facets[1]).toHaveLength(5)
  })

  it('refuses what its methods refuse', async () => {
    await expect(aggregateScan(ctx.db, homes, undefined, undefined, { facets: [{ field: 'kind', limit: 0 }] })).rejects.toMatchObject({ code: 'invalid_option' })
    await expect(aggregateScan(ctx.db, homes, undefined, undefined, { histograms: [{ field: 'kind', buckets: 4 }] })).rejects.toMatchObject({ code: 'unsupported_field_type' })
    await expect(aggregateScan(ctx.db, homes, undefined, undefined, { series: [{ field: 'rooms', range, granularity: 'day' }] })).rejects.toMatchObject({ code: 'unsupported_field_type' })
  })
})
