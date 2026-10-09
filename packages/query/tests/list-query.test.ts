import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { ListQuery, ResourceModel, SortSpec } from '@protobase/schema'
import { buildListQuery, listQuery, type ListOptions } from '../src/list-query'
import { bigItems, check, createTestDb, items, orderLines, uuidItems } from '../../../test-support/query'

let ctx: Awaited<ReturnType<typeof createTestDb>>
beforeAll(async () => { ctx = await createTestDb() })
afterAll(async () => { await ctx.db.destroy() })

const page = (model: ResourceModel, query: Partial<ListQuery>, options?: ListOptions) => listQuery(ctx.db, model, { limit: 500, ...query }, undefined, options)

// The walks cover 2k rows at 100 a page: as many pages as 10k rows at 500, with ties cut by page boundaries the same
// way, at a fifth of the rows. Each condition reads the same in AIP-160 and SQL.
const walkLimit = 100
const walked = { items: 'id <= 2000', orderLines: 'order_id <= 400', bigItems: 'id <= 5000002000', uuidItems: 'grp < 8' }

/** Pages through the rows matching `where`, returning the key of every row in the order received. */
const walkForward = async (model: ResourceModel, where: string, sort: SortSpec | undefined, keyOf: (row: Record<string, unknown>) => string, limit = walkLimit) => {
  const filter = check(model, where)
  const seen: string[] = []
  let cursor: string | undefined
  let guard = 0
  do {
    const result = await page(model, { filter, sort, cursor, limit })
    seen.push(...result.rows.map(keyOf))
    cursor = result.nextCursor ?? undefined
  } while (cursor && ++guard < 1000)
  return seen
}

const walkBackward = async (model: ResourceModel, where: string, sort: SortSpec | undefined, keyOf: (row: Record<string, unknown>) => string, limit = walkLimit) => {
  const filter = check(model, where)
  const pages: string[][] = []
  let cursor: string | undefined
  let guard = 0
  do {
    const result = await page(model, { filter, sort, cursor, direction: 'before', limit })
    pages.unshift(result.rows.map(keyOf))
    cursor = result.prevCursor ?? undefined
  } while (cursor && ++guard < 1000)
  return pages.flat()
}

const expected = async (select: string, from: string, order: string) =>
  (await ctx.pg.query<{ k: string }>(`select ${select} as k from ${from} order by ${order}`)).rows.map(row => String(row.k))

const id = (row: Record<string, unknown>) => String(row.id)

describe('keyset paging', () => {
  const sorts: Array<[string, SortSpec | undefined, string]> = [
    ['default', undefined, 'id asc'],
    ['single asc', [['qty', 'asc']], 'qty asc, id asc'],
    ['single desc', [['qty', 'desc']], 'qty desc, id desc'],
    ['uniform multi desc', [['category', 'desc'], ['qty', 'desc']], 'category desc, qty desc, id desc'],
    ['mixed', [['qty', 'asc'], ['created_at', 'desc']], 'qty asc, created_at desc, id asc'],
    ['mixed desc first', [['created_at', 'desc'], ['qty', 'asc']], 'created_at desc, qty asc, id desc'],
    ['text and decimal', [['name', 'asc'], ['price', 'desc']], 'name asc, price desc, id asc'],
  ]

  it.each(sorts)('forward, no gaps or duplicates: %s', async (_, sort, order) => {
    const seen = await walkForward(items, walked.items, sort, id)
    expect(seen).toEqual(await expected('id', `items where deleted_at is null and ${walked.items}`, order))
  })

  it.each(sorts)('backward from the end: %s', async (_, sort, order) => {
    const seen = await walkBackward(items, walked.items, sort, id)
    expect(seen).toEqual(await expected('id', `items where deleted_at is null and ${walked.items}`, order))
  })

  it('pages with a small limit and returns to where it started', async () => {
    const first = await page(items, { sort: [['qty', 'desc']], limit: 7 })
    const second = await page(items, { sort: [['qty', 'desc']], limit: 7, cursor: first.nextCursor! })
    const back = await page(items, { sort: [['qty', 'desc']], limit: 7, cursor: second.prevCursor!, direction: 'before' })
    expect(back.rows).toEqual(first.rows)
    expect(back.prevCursor).toBeNull()
    expect(back.nextCursor).not.toBeNull()
  })

  it('first page has no prevCursor and last page no nextCursor', async () => {
    const first = await page(items, { limit: 10 })
    expect(first.prevCursor).toBeNull()
    expect(first.nextCursor).not.toBeNull()
    const last = await page(items, { limit: 10, direction: 'before' })
    expect(last.nextCursor).toBeNull()
    expect(last.rows.at(-1)?.id).toBe(9999)
  })

  it('applies filters while paging', async () => {
    const filter = check(items, 'in(category, "red")')
    const seen: string[] = []
    let cursor: string | undefined
    do {
      const result = await page(items, { filter, cursor, sort: [['qty', 'desc']], limit: 300 })
      seen.push(...result.rows.map(id))
      cursor = result.nextCursor ?? undefined
    } while (cursor)
    expect(seen).toEqual(await expected('id', `items where deleted_at is null and category = 'red'`, 'qty desc, id desc'))
  })
})

describe('key types', () => {
  it('composite primary key', async () => {
    const key = (row: Record<string, unknown>) => `${row.order_id}/${row.line_no}`
    const sort: SortSpec = [['qty', 'desc']]
    const order = `qty desc, order_id desc, line_no desc`
    const from = `order_lines where ${walked.orderLines}`
    expect(await walkForward(orderLines, walked.orderLines, sort, key)).toEqual(await expected(`order_id || '/' || line_no`, from, order))
    expect(await walkBackward(orderLines, walked.orderLines, sort, key)).toEqual(await expected(`order_id || '/' || line_no`, from, order))
    expect(await walkForward(orderLines, walked.orderLines, undefined, key, 67)).toEqual(await expected(`order_id || '/' || line_no`, from, 'order_id, line_no'))
  })

  it('composite key with mixed sort', async () => {
    const key = (row: Record<string, unknown>) => `${row.order_id}/${row.line_no}`
    const sort: SortSpec = [['qty', 'asc'], ['note', 'desc']]
    const order = `qty asc, note desc, order_id asc, line_no asc`
    const from = `order_lines where ${walked.orderLines}`
    expect(await walkForward(orderLines, walked.orderLines, sort, key)).toEqual(await expected(`order_id || '/' || line_no`, from, order))
    expect(await walkBackward(orderLines, walked.orderLines, sort, key)).toEqual(await expected(`order_id || '/' || line_no`, from, order))
  })

  it('bigint primary key keeps exact values', async () => {
    const sort: SortSpec = [['grp', 'desc']]
    const seen = await walkForward(bigItems, walked.bigItems, sort, id)
    expect(seen).toEqual(await expected('id::text', `big_items where ${walked.bigItems}`, 'grp desc, id desc'))
    expect(await walkBackward(bigItems, walked.bigItems, sort, id)).toEqual(seen)
  })

  it('uuid primary key', async () => {
    const sort: SortSpec = [['grp', 'asc'], ['label', 'desc']]
    const seen = await walkForward(uuidItems, walked.uuidItems, sort, id)
    expect(seen).toEqual(await expected('id::text', `uuid_items where ${walked.uuidItems}`, 'grp asc, label desc, id asc'))
    expect(await walkBackward(uuidItems, walked.uuidItems, sort, id)).toEqual(seen)
  })

  it('text with commas survives the cursor', async () => {
    const sort: SortSpec = [['note', 'asc']]
    const key = (row: Record<string, unknown>) => `${row.order_id}/${row.line_no}`
    expect(await walkForward(orderLines, walked.orderLines, sort, key, 50)).toEqual(
      await expected(`order_id || '/' || line_no`, `order_lines where ${walked.orderLines}`, 'note asc, order_id asc, line_no asc'),
    )
  })
})

describe('columns and limits', () => {
  it('aliases columns back to field names and omits unrequested ones', async () => {
    const result = await page(items, { columns: ['id', 'secret'], limit: 2 })
    expect(result.rows).toEqual([{ id: 1, secret: 'item-1' }, { id: 2, secret: 'item-2' }])
  })

  it('excludes soft-deleted rows', async () => {
    const seen = await walkForward(items, walked.items, undefined, id)
    // Every 50th row is soft-deleted
    expect(seen).toHaveLength(1960)
    expect(seen).not.toContain('50')
  })

  it('caps limit at 500', async () => {
    expect((await page(items, { limit: 10_000 })).rows).toHaveLength(500)
  })

  it('rejects invalid limits, columns, sorts and cursors', async () => {
    const code = (query: Partial<ListQuery>) => page(items, query).catch(error => error.code)
    expect(await code({ limit: 0 })).toBe('invalid_limit')
    expect(await code({ limit: 1.5 })).toBe('invalid_limit')
    expect(await code({ columns: ['nope'] })).toBe('unknown_field')
    expect(await code({ sort: [['secret', 'asc']] })).toBe('not_sortable')
    expect(await code({ sort: [['qty', 'sideways' as never]] })).toBe('invalid_sort')
    expect(await code({ cursor: 'not-a-cursor' })).toBe('invalid_cursor')
    expect(await code({ cursor: btoa('{"s":[1]}') })).toBe('invalid_cursor')
  })

  it('rejects a cursor from a different sort', async () => {
    const first = await page(items, { sort: [['qty', 'asc']], limit: 5 })
    const mismatch = await page(items, { sort: [['qty', 'desc']], cursor: first.nextCursor! }).catch(error => error.code)
    expect(mismatch).toBe('invalid_cursor')
  })

  it('treats the cursor as opaque base64url', async () => {
    const first = await page(items, { limit: 5 })
    expect(first.nextCursor).toMatch(/^[A-Za-z0-9_-]+$/)
  })
})

describe('buildListQuery', () => {
  it('returns the query listQuery runs, without executing it', async () => {
    const plan = await buildListQuery(ctx.db, items, { limit: 10, sort: [['qty', 'desc']] })
    const compiled = plan.query.compile()
    expect(compiled.sql).toMatch(/order by "t"\."qty" desc, "t"\."id" desc/)
    expect(plan.limit).toBe(10)
    expect((await plan.query.execute()).length).toBe(11)
  })
})

describe('extraColumns', () => {
  it('selects a mapped column as exact text under an alias', async () => {
    await ctx.pg.exec(`update items set created_at = timestamptz '2024-05-05 10:20:30.123456+00' where id = 1`)
    const result = await page(items, { limit: 1, columns: ['id'] }, { extraColumns: [{ field: 'created_at', as: 'text', alias: '__version' }] })
    const expected = await ctx.pg.query<{ v: string }>('select created_at::text v from items where id = 1')
    expect(result.rows[0]).toEqual({ id: 1, __version: expected.rows[0]!.v })
    expect(result.rows[0]!.__version).toContain(':30.123456')
    const plan = await buildListQuery(ctx.db, items, { limit: 1 }, undefined, { extraColumns: [{ field: 'created_at', as: 'text', alias: '__version' }] })
    expect(plan.query.compile().sql).toContain('"t"."created_at"::text as "__version"')
  })

  it('does not disturb paging and rejects bad mappings', async () => {
    const extra = { extraColumns: [{ field: 'qty', as: 'text' as const, alias: '__q' }] }
    const first = await page(items, { limit: 5, sort: [['qty', 'desc']] }, extra)
    const second = await page(items, { limit: 5, sort: [['qty', 'desc']], cursor: first.nextCursor! }, extra)
    expect(first.rows.every(row => typeof row.__q === 'string')).toBe(true)
    expect(second.rows).toHaveLength(5)
    const reject = (extraColumns: Array<{ field: string; as: 'text'; alias: string }>) =>
      page(items, { limit: 1 }, { extraColumns }).catch(error => error.code)
    expect(await reject([{ field: 'nope', as: 'text', alias: '__x' }])).toBe('unknown_field')
    expect(await reject([{ field: 'qty', as: 'text', alias: 'name' }])).toBe('invalid_option')
    expect(await reject([{ field: 'qty', as: 'text', alias: '__pb_key0' }])).toBe('invalid_option')
    expect(await reject([{ field: 'qty', as: 'bytes' as never, alias: '__x' }])).toBe('invalid_option')
  })
})
