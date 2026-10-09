import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { listQuery } from '../src/list-query'
import { scrollAnchors } from '../src/scroll-anchors'
import { check, createTestDb, field, items, model } from '../../../test-support/query'

const wide = model('wide', ['id'], [field('id', 'integer'), field('val', 'integer')])

let ctx: Awaited<ReturnType<typeof createTestDb>>
beforeAll(async () => {
  ctx = await createTestDb()
  await ctx.pg.exec(`
    create table wide (id integer primary key, val integer not null);
    insert into wide select i, (i::bigint * 7919 % 1000003)::int from generate_series(1, 150000) i;
    analyze wide;
  `)
}, 60_000)
afterAll(async () => { await ctx.db.destroy() })

describe('exact mode', () => {
  it('is chosen for small tables and gives exact positions', async () => {
    const result = await scrollAnchors(ctx.db, items, 'qty')
    expect(result.mode).toBe('exact')
    expect(result.totalRows).toBe(9800)
    expect(result.anchors[0]?.position).toBe(0)
    const positions = result.anchors.map(a => a.position)
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
    expect(result.anchors.length).toBeGreaterThanOrEqual(90)
    expect(result.anchors.length).toBeLessThanOrEqual(100)
  })

  it('seeks to an exact row without OFFSET', async () => {
    const result = await scrollAnchors(ctx.db, items, 'qty')
    const cursor = await result.seekToPosition(5000)
    const page = await listQuery(ctx.db, items, { sort: [['qty', 'asc']], cursor, limit: 3 })
    const expected = await ctx.pg.query<{ id: number }>(`select id from items where deleted_at is null order by qty asc, id asc offset 5000 limit 3`)
    expect(page.rows.map(r => r.id)).toEqual(expected.rows.map(r => r.id))
    expect(page.prevCursor).not.toBeNull()
  })

  it('seeks in descending order and at the edges', async () => {
    const result = await scrollAnchors(ctx.db, items, 'qty', { direction: 'desc' })
    const cursor = await result.seekToPosition(1234)
    const page = await listQuery(ctx.db, items, { sort: [['qty', 'desc']], cursor, limit: 2 })
    const expected = await ctx.pg.query<{ id: number }>(`select id from items where deleted_at is null order by qty desc, id desc offset 1234 limit 2`)
    expect(page.rows.map(r => r.id)).toEqual(expected.rows.map(r => r.id))
    expect(await result.seekToPosition(0)).toBeUndefined()
    const last = await listQuery(ctx.db, items, { sort: [['qty', 'desc']], cursor: await result.seekToPosition(1_000_000), limit: 5 })
    expect(last.rows).toHaveLength(1)
  })
})

describe('statistics mode', () => {
  it('is chosen between 100k and 5M rows and reads pg_stats', async () => {
    const result = await scrollAnchors(ctx.db, wide, 'val')
    expect(result.mode).toBe('statistics')
    expect(result.totalRows).toBe(150000)
    expect(result.anchors.length).toBeGreaterThan(50)
    const positions = result.anchors.map(a => a.position)
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
    expect(positions[0]).toBe(0)
    expect(positions.at(-1)).toBeGreaterThan(140000)
  })

  it('seeks near the requested position through a boundary cursor', async () => {
    const result = await scrollAnchors(ctx.db, wide, 'val')
    const target = 75000
    const cursor = await result.seekToPosition(target)
    const page = await listQuery(ctx.db, wide, { sort: [['val', 'asc']], cursor, limit: 3 })
    const first = page.rows[0]!
    const below = await ctx.pg.query<{ n: string }>(`select count(*)::text n from wide where val < ${first.val}`)
    expect(Math.abs(Number(below.rows[0]!.n) - target)).toBeLessThan(150000 * 0.03)
    const earlier = await listQuery(ctx.db, wide, { sort: [['val', 'asc']], cursor, direction: 'before', limit: 3 })
    expect(Number(earlier.rows.at(-1)!.val)).toBeLessThan(Number(first.val))
  })

  it('walks descending anchors from the top', async () => {
    const result = await scrollAnchors(ctx.db, wide, 'val', { direction: 'desc' })
    expect(result.anchors[0]?.position).toBeLessThan(5000)
    const cursor = await result.seekToPosition(30000)
    const page = await listQuery(ctx.db, wide, { sort: [['val', 'desc']], cursor, limit: 1 })
    const above = await ctx.pg.query<{ n: string }>(`select count(*)::text n from wide where val > ${page.rows[0]!.val}`)
    expect(Math.abs(Number(above.rows[0]!.n) - 30000)).toBeLessThan(150000 * 0.03)
  })

  it('refuses tables without statistics', async () => {
    await ctx.pg.exec(`create table fresh (id integer primary key, val integer not null); insert into fresh select i, i from generate_series(1, 150000) i;`)
    const fresh = model('fresh', ['id'], [field('id', 'integer'), field('val', 'integer')])
    await expect(scrollAnchors(ctx.db, fresh, 'val')).rejects.toMatchObject({ code: 'no_statistics' })
  })
})

describe('sampled mode', () => {
  it('is not implemented and says why', async () => {
    await ctx.pg.exec(`update pg_class set reltuples = 6000000 where relname = 'wide'`)
    await expect(scrollAnchors(ctx.db, wide, 'val')).rejects.toThrow(/Not implemented: sampled scroll mode/)
    await ctx.pg.exec('analyze wide')
  })
})

describe('with a filter', () => {
  it('exact mode ranks only matching rows', async () => {
    const filter = check(items, 'category = "red"')
    const result = await scrollAnchors(ctx.db, items, 'qty', { filter })
    const total = Number((await ctx.pg.query<{ n: string }>(`select count(*)::text n from items where category = 'red' and deleted_at is null`)).rows[0]!.n)
    expect(result.mode).toBe('exact')
    expect(result.totalRows).toBe(total)
    const cursor = await result.seekToPosition(700)
    const page = await listQuery(ctx.db, items, { filter, sort: [['qty', 'asc']], cursor, limit: 3 })
    const expected = await ctx.pg.query<{ id: number }>(`select id from items where category = 'red' and deleted_at is null order by qty, id offset 700 limit 3`)
    expect(page.rows.map(r => r.id)).toEqual(expected.rows.map(r => r.id))
  })

  it('statistics mode scales positions by the filter selectivity', async () => {
    const filter = check(wide, 'id <= 120000')
    const all = await scrollAnchors(ctx.db, wide, 'val')
    const most = await scrollAnchors(ctx.db, wide, 'val', { filter })
    expect(most.mode).toBe('statistics')
    expect(Math.abs(most.totalRows - 120000)).toBeLessThan(120000 * 0.1)
    const ratio = most.anchors.at(-1)!.position / all.anchors.at(-1)!.position
    expect(ratio).toBeGreaterThan(0.7)
    expect(ratio).toBeLessThan(0.9)
    const cursor = await most.seekToPosition(60000)
    const page = await listQuery(ctx.db, wide, { filter, sort: [['val', 'asc']], cursor, limit: 1 })
    const below = await ctx.pg.query<{ n: string }>(`select count(*)::text n from wide where id <= 120000 and val < ${page.rows[0]!.val}`)
    expect(Math.abs(Number(below.rows[0]!.n) - 60000)).toBeLessThan(120000 * 0.05)
  })

  it('switches to exact mode when the filter leaves few rows', async () => {
    const result = await scrollAnchors(ctx.db, wide, 'val', { filter: check(wide, 'id <= 500') })
    expect(result.mode).toBe('exact')
    expect(result.totalRows).toBe(500)
  })
})
