import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { ListQuery, ResourceModel, SortSpec } from '@protobase/schema'
import { listQuery } from '../src/list-query'
import { createTestDb, field, model } from '../../../test-support/query'

const sparse: ResourceModel = model('sparse', ['id'], [
  field('id', 'integer'),
  field('score', 'integer', { nullable: true }),
  field('label', 'text', { nullable: true }),
])

let ctx: Awaited<ReturnType<typeof createTestDb>>
beforeAll(async () => {
  ctx = await createTestDb()
  await ctx.pg.exec(`
    create table sparse (id integer primary key, score integer, label text);
    insert into sparse
    select i, case when i % 10 < 3 then null else (i * 37) % 50 end, case when i % 7 = 0 then null else 'l' || (i % 13) end
    from generate_series(1, 4000) i;
  `)
})
afterAll(async () => { await ctx.db.destroy() })

const page = (query: Partial<ListQuery>) => listQuery(ctx.db, sparse, { limit: 137, ...query })

const forward = async (sort: SortSpec) => {
  const seen: number[] = []
  let cursor: string | undefined
  do {
    const result = await page({ sort, cursor })
    seen.push(...result.rows.map(row => Number(row.id)))
    cursor = result.nextCursor ?? undefined
  } while (cursor)
  return seen
}

const backward = async (sort: SortSpec) => {
  const pages: number[][] = []
  let cursor: string | undefined
  do {
    const result = await page({ sort, cursor, direction: 'before' })
    pages.unshift(result.rows.map(row => Number(row.id)))
    cursor = result.prevCursor ?? undefined
  } while (cursor)
  return pages.flat()
}

const expected = async (order: string) =>
  (await ctx.pg.query<{ id: number }>(`select id from sparse order by ${order}`)).rows.map(row => row.id)

describe('keyset paging over nullable columns (30% NULL)', () => {
  const sorts: Array<[string, SortSpec, string]> = [
    ['asc', [['score', 'asc']], 'score asc nulls last, id asc'],
    ['desc', [['score', 'desc']], 'score desc nulls first, id desc'],
    ['mixed asc/desc', [['score', 'asc'], ['label', 'desc']], 'score asc nulls last, label desc nulls first, id asc'],
    ['mixed desc/asc', [['label', 'desc'], ['score', 'asc']], 'label desc nulls first, score asc nulls last, id desc'],
    ['uniform desc on two nullable keys', [['label', 'desc'], ['score', 'desc']], 'label desc nulls first, score desc nulls first, id desc'],
    ['uniform asc on two nullable keys', [['label', 'asc'], ['score', 'asc']], 'label asc nulls last, score asc nulls last, id asc'],
  ]

  it('has the expected share of NULLs', async () => {
    const { rows } = await ctx.pg.query<{ n: string }>('select count(*)::text n from sparse where score is null')
    expect(Number(rows[0]!.n) / 4000).toBeGreaterThan(0.29)
  })

  it.each(sorts)('forward without gaps or duplicates: %s', async (_, sort, order) => {
    expect(await forward(sort)).toEqual(await expected(order))
  })

  it.each(sorts)('backward from the end: %s', async (_, sort, order) => {
    expect(await backward(sort)).toEqual(await expected(order))
  })

  it('crosses the NULL boundary inside a page and in both directions', async () => {
    const sort: SortSpec = [['score', 'asc']]
    let cursor: string | undefined
    for (;;) {
      const result = await page({ sort, cursor })
      const nulls = result.rows.filter(row => row.score === null).length
      if (nulls > 0 && nulls < result.rows.length) {
        expect(result.rows.slice(-nulls).every(row => row.score === null)).toBe(true)
        const back = await page({ sort, cursor: result.nextCursor!, direction: 'before' })
        // the cursor row itself is excluded, so the page before it ends one row earlier
        expect(back.rows.slice(-(result.rows.length - 1)).map(r => r.id)).toEqual(result.rows.slice(0, -1).map(r => r.id))
        return
      }
      cursor = result.nextCursor ?? undefined
      expect(cursor).toBeDefined()
    }
  })

  it('reads NULL rows first when sorting descending', async () => {
    const first = await page({ sort: [['score', 'desc']], limit: 5 })
    expect(first.rows.every(row => row.score === null)).toBe(true)
  })
})
