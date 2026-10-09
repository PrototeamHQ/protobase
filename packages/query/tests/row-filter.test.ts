import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { CheckedFilter, ResourceModel } from '@protobase/schema'
import { estimateCount } from '../src/estimate-count'
import { exactCount } from '../src/exact-count'
import { facetCounts } from '../src/facet-counts'
import { histogram } from '../src/histogram'
import { buildListQuery, listQuery } from '../src/list-query'
import { scrollAnchors } from '../src/scroll-anchors'
import { series } from '../src/series'
import { check, createTestDb, field, model } from '../../../test-support/query'

const fullFields = [
  field('id', 'integer'),
  field('title', 'text'),
  field('kind', 'text'),
  field('amount', 'integer'),
  field('level', 'integer'),
  field('org', 'integer'),
  field('at', 'timestamp'),
  field('removed_at', 'timestamp', { nullable: true }),
]
const extra = { tenant: 'org', softDelete: 'removed_at' }
const full = model('docs', ['id'], fullFields, extra)
/** What the user may see: no level, org or removed_at. */
const restricted: ResourceModel = model('docs', ['id'], fullFields.filter(f => !['level', 'org', 'removed_at'].includes(f.name)), extra)

let ctx: Awaited<ReturnType<typeof createTestDb>>
beforeAll(async () => {
  ctx = await createTestDb({ seed: false })
  await ctx.pg.exec(`
    create table docs (id integer primary key, title text not null, kind text not null, amount integer not null,
      level integer not null, org integer not null, at timestamptz not null, removed_at timestamptz);
    insert into docs select i, 'doc ' || i, (array['a','b','c'])[1 + i % 3], i % 100, i % 5, 1 + i % 2,
      timestamptz '2024-01-01+00' + (i % 10) * interval '1 day', case when i % 20 = 0 then now() end
    from generate_series(1, 3000) i;
    analyze docs;
  `)
})
afterAll(async () => { await ctx.db.destroy() })

const rowFilter = check(full, 'level <= 1')
const scope = { tenantValue: 2, rowFilter, fullModel: full }
const visible = `org = 2 and level <= 1 and removed_at is null`
const sqlCount = async (where: string) => Number((await ctx.pg.query<{ n: string }>(`select count(*)::text n from docs where ${where}`)).rows[0]!.n)

describe('row filter from access rules', () => {
  it('is applied although its column is absent from the restricted model', async () => {
    expect(restricted.fields.level).toBeUndefined()
    const seen: number[] = []
    let cursor: string | undefined
    do {
      const result = await listQuery(ctx.db, restricted, { limit: 200, cursor, columns: ['id'] }, scope)
      seen.push(...result.rows.map(row => Number(row.id)))
      cursor = result.nextCursor ?? undefined
    } while (cursor)
    const expected = await ctx.pg.query<{ id: number }>(`select id from docs where ${visible} order by id`)
    expect(seen).toEqual(expected.rows.map(row => row.id))
  })

  it('cannot be widened by the user filter, even with OR', async () => {
    const filter = check(restricted, 'kind = "a" OR kind = "b" OR amount >= 0')
    const result = await listQuery(ctx.db, restricted, { limit: 500, filter, columns: ['id'] }, scope)
    const hidden = await ctx.pg.query<{ id: number }>(`select id from docs where not (${visible}) and id = any($1)`, [result.rows.map(row => row.id)])
    expect(hidden.rows).toEqual([])
    expect(result.rows.length).toBe(500)
  })

  it('keeps hidden columns unreachable for the user', () => {
    expect(() => check(restricted, 'level = 1')).toThrow(/Unknown field/)
    return expect(listQuery(ctx.db, restricted, { limit: 1, columns: ['level'] }, scope)).rejects.toMatchObject({ code: 'unknown_field' })
  })

  it('accepts a row filter on a column that is not filterable', async () => {
    const guarded = model('docs', ['id'], fullFields.map(f => (f.name === 'level' ? { ...f, filterable: false } : f)), extra)
    const node: CheckedFilter = { kind: 'compare', op: '<=', field: guarded.fields.level!, value: { kind: 'number', value: 1, raw: '1', span: { start: 0, end: 0 } }, span: { start: 0, end: 0 } }
    const count = await exactCount(ctx.db, restricted, undefined, { tenantValue: 2, rowFilter: node, fullModel: guarded })
    expect(count).toBe(await sqlCount(visible))
  })

  it('still requires the tenant value', async () => {
    await expect(exactCount(ctx.db, restricted, undefined, { rowFilter, fullModel: full })).rejects.toMatchObject({ code: 'missing_tenant' })
  })

  it('reports a missing pg_trgm for similar() in a row filter', async () => {
    const similar = check(full, 'similar(title, "doc")')
    await expect(exactCount(ctx.db, restricted, undefined, { tenantValue: 2, rowFilter: similar, fullModel: full })).rejects.toMatchObject({ code: 'missing_extension' })
  })
})

describe('aggregates never exceed what the user can see', () => {
  const total = 3000

  it('exact count equals the visible rows and respects the user filter on top', async () => {
    expect(await exactCount(ctx.db, restricted, undefined, scope)).toBe(await sqlCount(visible))
    expect(await exactCount(ctx.db, restricted, check(restricted, 'kind = "a"'), scope)).toBe(await sqlCount(`${visible} and kind = 'a'`))
  })

  it('estimates stay near the visible rows, far below the table', async () => {
    const estimate = await estimateCount(ctx.db, restricted, undefined, scope)
    const exact = await sqlCount(visible)
    expect(estimate).toBeGreaterThan(exact * 0.5)
    expect(estimate).toBeLessThan(exact * 2)
    expect(estimate).toBeLessThan(total / 2)
    const filtered = await estimateCount(ctx.db, restricted, check(restricted, 'kind = "a"'), scope)
    expect(filtered).toBeLessThan(estimate)
  })

  it('facets keep the row filter when dropping their own clause', async () => {
    const filter = check(restricted, 'kind = "a" AND amount < 50')
    const facets = await facetCounts(ctx.db, restricted, 'kind', filter, { statementTimeoutMs: 5000, scope })
    const expected = await ctx.pg.query<{ kind: string; n: string }>(`select kind, count(*)::text n from docs where ${visible} and amount < 50 group by 1 order by count(*) desc, kind`)
    expect(facets).toEqual(expected.rows.map(row => ({ value: row.kind, count: Number(row.n) })))
    expect(facets.length).toBe(3)
    expect(facets.reduce((sum, f) => sum + f.count, 0)).toBeLessThan(await sqlCount('amount < 50'))
  })

  it('series, histogram and exact anchors only see visible rows', async () => {
    const points = await series(ctx.db, restricted, 'at', { range: { from: '2024-01-01T00:00:00Z', to: '2024-01-11T00:00:00Z' }, granularity: 'day', scope })
    expect(points.reduce((sum, p) => sum + p.count, 0)).toBe(await sqlCount(visible))
    const bins = await histogram(ctx.db, restricted, 'amount', undefined, 5, scope)
    expect(bins.buckets.reduce((sum, b) => sum + b.count, 0)).toBe(await sqlCount(visible))
    const anchors = await scrollAnchors(ctx.db, restricted, 'amount', { scope })
    expect(anchors.mode).toBe('exact')
    expect(anchors.totalRows).toBe(await sqlCount(visible))
    const cursor = await anchors.seekToPosition(100)
    const page = await listQuery(ctx.db, restricted, { limit: 2, cursor, sort: [['amount', 'asc']], columns: ['id'] }, scope)
    const expected = await ctx.pg.query<{ id: number }>(`select id from docs where ${visible} order by amount, id offset 100 limit 2`)
    expect(page.rows.map(r => r.id)).toEqual(expected.rows.map(r => r.id))
  })
})

describe('extra columns follow the restricted model', () => {
  it('allows readable fields and refuses hidden ones', async () => {
    const plan = await buildListQuery(ctx.db, restricted, { limit: 1 }, scope, { extraColumns: [{ field: 'at', as: 'text', alias: '__version' }] })
    expect(plan.query.compile().sql).toContain('"t"."at"::text as "__version"')
    await expect(buildListQuery(ctx.db, restricted, { limit: 1 }, scope, { extraColumns: [{ field: 'level', as: 'text', alias: '__v' }] })).rejects.toMatchObject({ code: 'unknown_field' })
  })

  it('puts the row filter in the SQL that is explained', async () => {
    const plan = await buildListQuery(ctx.db, restricted, { limit: 1 }, scope)
    const compiled = plan.query.compile()
    expect(compiled.sql).toContain('"t"."level" <=')
    expect(compiled.sql).toContain('"t"."org" =')
  })
})
