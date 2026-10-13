import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildRelatedRows, relatedRows } from '../src/related-rows'
import { check, createTestDb, field, model } from '../../../test-support/query'

const fields = [
  field('id', 'bigint'),
  field('listing_id', 'relation'),
  field('position', 'integer'),
  field('photo', 'text', { filterable: false, sortable: false }),
  field('org', 'integer'),
  field('hidden', 'boolean'),
  field('removed_at', 'timestamp', { nullable: true }),
]
const full = model('photos', ['id'], fields, { tenant: 'org', softDelete: 'removed_at' })
const photos = model('photos', ['id'], fields.filter(f => !['org', 'hidden', 'removed_at'].includes(f.name)), { tenant: 'org', softDelete: 'removed_at' })
const scope = { tenantValue: 1, fullModel: full }

let ctx: Awaited<ReturnType<typeof createTestDb>>
beforeAll(async () => {
  ctx = await createTestDb({ seed: false })
  await ctx.pg.exec(`
    create table photos (id bigint primary key, listing_id bigint not null, position integer not null, photo text not null,
      org integer not null, hidden boolean not null, removed_at timestamptz);
    create index on photos (listing_id, position);
    insert into photos values
      (1, 10, 3, 'c', 1, false, null), (2, 10, 1, 'a', 1, false, null), (3, 10, 2, 'b', 1, false, null),
      (4, 10, 4, 'd', 1, false, null), (5, 20, 1, 'x', 1, false, null), (6, 20, 2, 'removed', 1, false, now()),
      (7, 20, 3, 'other org', 2, false, null), (8, 20, 4, 'hidden', 1, true, null), (9, 20, 5, 'y', 1, false, null);
  `)
})
afterAll(async () => { await ctx.db.destroy() })

const photosOf = (rows: Array<Record<string, unknown>>, listing: number) => rows.filter(row => Number(row.listing_id) === listing).map(row => row.photo)

describe('relatedRows', () => {
  it('reads the rows of every value in order, at most limit of each', async () => {
    const rows = await relatedRows(ctx.db, photos, { field: 'listing_id', values: [10, 20, 30], columns: ['photo'], sort: [['position', 'asc']], limit: 3 }, scope)
    expect(photosOf(rows, 10)).toEqual(['a', 'b', 'c'])
    expect(photosOf(rows, 30)).toEqual([])
    expect(Object.keys(rows[0]!).sort()).toEqual(['listing_id', 'photo'])
  })

  it('follows the sort\'s direction, the key breaking ties', async () => {
    const rows = await relatedRows(ctx.db, photos, { field: 'listing_id', values: ['10'], columns: ['id', 'photo'], sort: [['position', 'desc']], limit: 10 }, scope)
    expect(rows.map(row => row.photo)).toEqual(['d', 'c', 'b', 'a'])
    expect((await relatedRows(ctx.db, photos, { field: 'listing_id', values: [10], columns: ['photo'], limit: 2 }, scope)).map(row => row.photo)).toEqual(['c', 'a'])
  })

  it('reads only rows inside the scope: tenant, soft delete and row filter', async () => {
    const rowFilter = check(full, 'hidden = false')
    const rows = await relatedRows(ctx.db, photos, { field: 'listing_id', values: [20], columns: ['photo'], sort: [['position', 'asc']], limit: 2 }, { ...scope, rowFilter })
    expect(rows.map(row => row.photo)).toEqual(['x', 'y'])
  })

  it('answers nothing for no values, and refuses a limit past the list\'s', async () => {
    expect(await relatedRows(ctx.db, photos, { field: 'listing_id', values: [], columns: ['photo'], limit: 3 }, scope)).toEqual([])
    await expect(relatedRows(ctx.db, photos, { field: 'listing_id', values: [10], columns: ['photo'], limit: 0 }, scope)).rejects.toMatchObject({ code: 'invalid_limit' })
    await expect(relatedRows(ctx.db, photos, { field: 'listing_id', values: [10], columns: ['photo'], limit: 3 })).rejects.toMatchObject({ code: 'missing_tenant' })
  })

  it('reads each value\'s rows through an index on the field and the sort', async () => {
    const built = buildRelatedRows(ctx.db, photos, { field: 'listing_id', values: [10, 20], columns: ['photo'], sort: [['position', 'asc']], limit: 3 }, scope).compile()
    await ctx.pg.exec('set enable_seqscan = off')
    const plan = await ctx.pg.query<{ 'QUERY PLAN': string }>(`explain ${built.sql}`, [...built.parameters])
    await ctx.pg.exec('reset enable_seqscan')
    const text = plan.rows.map(row => row['QUERY PLAN']).join('\n')
    expect(text).toMatch(/Index Scan on photos_listing_id_position_idx[^\n]*\n\s*Index Cond: \(listing_id = t\.listing_id\)/)
  })
})
