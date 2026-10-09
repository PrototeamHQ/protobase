import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { ResourceModel } from '@protobase/schema'
import { seekToPosition } from '../src/seek-to-position'
import { check, createTestDb, field, model } from '../../../test-support/query'

const fields = [
  field('id', 'integer'),
  field('val', 'integer'),
  field('label', 'text'),
  field('level', 'integer'),
  field('org', 'integer'),
]
const full = model('wide_docs', ['id'], fields, { tenant: 'org' })
/** The caller sees no level or org; other orgs' rows and level > 3 are not theirs. */
const restricted: ResourceModel = model('wide_docs', ['id'], fields.filter(f => f.name !== 'level' && f.name !== 'org'), { tenant: 'org' })
const scope = { tenantValue: 2, rowFilter: check(full, 'level <= 3'), fullModel: full }
const visible = 'org = 2 and level <= 3'

let ctx: Awaited<ReturnType<typeof createTestDb>>
beforeAll(async () => {
  ctx = await createTestDb({ seed: false })
  await ctx.pg.exec(`
    create table wide_docs (id integer primary key, val integer not null, label text not null, level integer not null, org integer not null);
    insert into wide_docs select i, (i::bigint * 7919 % 1000003)::int, case when org = 2 then 'mine-' || i else 'SECRET-' || i end,
      (i / 7) % 5, org
    from (select i, case when i % 5 < 3 then 2 else 1 end as org from generate_series(1, 300000) i) s;
    analyze wide_docs;
  `)
}, 90_000)
afterAll(async () => { await ctx.db.destroy() })

const visibleCount = async () => Number((await ctx.pg.query<{ n: string }>(`select count(*)::text n from wide_docs where ${visible}`)).rows[0]!.n)

describe('statistics mode, scoped caller', () => {
  it('seeks to 50% and returns only visible rows', async () => {
    const total = await visibleCount()
    expect(total).toBeGreaterThan(100_000)
    const result = await seekToPosition(ctx.db, restricted, { position: Math.round(total / 2), orderBy: [['val', 'asc']], limit: 100 }, scope)
    expect(result.rows).toHaveLength(100)

    const ids = result.rows.map(row => row.id)
    const outside = await ctx.pg.query<{ n: string }>(`select count(*)::text n from wide_docs where id = any($1) and not (${visible})`, [ids])
    expect(outside.rows[0]!.n).toBe('0')
    for (const row of result.rows) {
      expect(Object.keys(row).sort()).toEqual(['id', 'label', 'val'])
      expect(String(row.label)).toMatch(/^mine-/)
    }

    const first = result.rows[0]!
    const below = await ctx.pg.query<{ n: string }>(`select count(*)::text n from wide_docs where ${visible} and val < ${first.val}`)
    expect(Math.abs(Number(below.rows[0]!.n) - total / 2)).toBeLessThan(total * 0.05)
  })

  it('returns page tokens that continue through visible rows only', async () => {
    const total = await visibleCount()
    const page = await seekToPosition(ctx.db, restricted, { position: Math.round(total / 2), orderBy: [['val', 'desc']], limit: 20 }, scope)
    expect(page.nextCursor).not.toBeNull()
    expect(page.prevCursor).not.toBeNull()
    const decoded = JSON.parse(atob(page.nextCursor!.replaceAll('-', '+').replaceAll('_', '/')))
    const lastId = page.rows.at(-1)!.id
    const lastRow = await ctx.pg.query<{ val: number }>(`select val::text from wide_docs where id = ${lastId}`)
    expect(decoded.v[0]).toBe(String(lastRow.rows[0]!.val))
  })

  it('applies the user filter on top of the scope', async () => {
    const filter = check(restricted, 'val >= 500000')
    const result = await seekToPosition(ctx.db, restricted, { position: 100, orderBy: [['val', 'asc']], filter, limit: 50 }, scope)
    expect(result.rows.length).toBe(50)
    expect(result.rows.every(row => Number(row.val) >= 500000 && String(row.label).startsWith('mine-'))).toBe(true)
  })
})

describe('exact mode and validation', () => {
  it('seeks exactly with a multi-key order when the scoped set is small', async () => {
    const filter = check(restricted, 'id <= 2000')
    const result = await seekToPosition(ctx.db, restricted, { position: 300, orderBy: [['label', 'asc'], ['val', 'desc']], filter, limit: 3 }, scope)
    const expected = await ctx.pg.query<{ id: number }>(
      `select id from wide_docs where ${visible} and id <= 2000 order by label asc, val desc, id asc offset 300 limit 3`,
    )
    expect(result.rows.map(row => row.id)).toEqual(expected.rows.map(row => row.id))
  })

  it('position 0 is the first visible page; bad input is rejected', async () => {
    const first = await seekToPosition(ctx.db, restricted, { position: 0, orderBy: [['id', 'asc']], limit: 2 }, scope)
    const expected = await ctx.pg.query<{ id: number }>(`select id from wide_docs where ${visible} order by id limit 2`)
    expect(first.rows.map(row => row.id)).toEqual(expected.rows.map(row => row.id))
    await expect(seekToPosition(ctx.db, restricted, { position: -1, orderBy: [['id', 'asc']] }, scope)).rejects.toMatchObject({ code: 'invalid_option' })
    await expect(seekToPosition(ctx.db, restricted, { position: 1, orderBy: [] }, scope)).rejects.toMatchObject({ code: 'invalid_sort' })
    await expect(seekToPosition(ctx.db, restricted, { position: 1, orderBy: [['id', 'asc']] })).rejects.toMatchObject({ code: 'missing_tenant' })
  })
})

describe('list options', () => {
  it('passes extraColumns through to the page', async () => {
    const result = await seekToPosition(ctx.db, restricted, { position: 10, orderBy: [['id', 'asc']], limit: 2 }, scope, {
      extraColumns: [{ field: 'val', as: 'text', alias: '__pb_etag' }],
    })
    expect(result.rows).toHaveLength(2)
    for (const row of result.rows) expect(row.__pb_etag).toBe(String(row.val))
  })
})
