import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { ResourceModel, SortSpec } from '@protobase/schema'
import { buildListQuery } from '../src/list-query'
import { explainPlan, walkPlan } from '../src/explain'
import { uncoveredColumns } from '../src/index-coverage'
import { tableIndexes } from '../src/table-indexes'
import { check, createTestDb, field, model } from '../../../test-support/query'

let ctx: Awaited<ReturnType<typeof createTestDb>>

// The property-finder case: about 60% of 15k listings are for sale or for rent, and the home page lists those of one
// offer that are available, newest first, through (for_sale | for_rent, status, published_at desc).
const listings = model(
  'listings',
  ['id'],
  [
    field('id', 'integer'),
    field('org', 'integer'),
    field('for_sale', 'boolean'),
    field('for_rent', 'boolean'),
    field('status', 'text'),
    field('published_at', 'timestamp'),
    field('city', 'text'),
    field('title', 'text'),
    field('phone', 'text'),
    field('price', 'integer'),
    field('attrs', 'json', { nullable: true }),
  ],
  { search: ['title', 'phone'], searchMatch: { phone: 'digitsEnd' } },
)

beforeAll(async () => {
  ctx = await createTestDb({ trigram: true })
  await ctx.pg.exec(`
    create table listings (
      id integer primary key, org integer not null, for_sale boolean not null, for_rent boolean not null,
      status text not null, published_at timestamptz not null, city text not null, title text not null,
      phone text not null, price integer not null, attrs jsonb
    );
    insert into listings
    select i, i % 3, i % 10 < 4, i % 10 between 4 and 5, (array['available', 'sold'])[1 + i % 2],
      timestamptz '2026-01-01+00' + i * interval '1 minute', 'city-' || i % 50, 'listing ' || i, '+31 6 ' || i, i % 900, null
    from generate_series(1, 15000) i;
    create index listings_sale_idx on listings (for_sale, status, published_at desc);
    create index listings_rent_idx on listings (for_rent, status, published_at desc);
    create index listings_org_price_idx on listings (org, price);
    create index listings_city_idx on listings (city) where status = 'available';
    create index listings_title_trgm_idx on listings using gin (title gin_trgm_ops);
    create index listings_attrs_idx on listings using gin (attrs);
    create view listing_titles as select id, title from listings;
    analyze listings;
  `)
})
afterAll(async () => { await ctx.db.destroy() })

const uncovered = async (filter?: string, sort?: SortSpec, target: ResourceModel = listings) =>
  uncoveredColumns(target, await tableIndexes(ctx.db, target), { ...(filter && { filter: check(target, filter) }), ...(sort && { sort }) })

describe('uncoveredColumns', () => {
  it('passes a broad filter on an indexed boolean and status, sorted by the indexed date after them', async () => {
    expect(await uncovered('for_sale = true AND status = "available"', [['published_at', 'desc']])).toEqual([])
  })

  it('reads that page through the index with its LIMIT, without a sequential scan', async () => {
    const filter = check(listings, 'for_sale = true AND status = "available"')
    const { query } = await buildListQuery(ctx.db, listings, { filter, sort: [['published_at', 'desc']], limit: 24 })
    const nodes = walkPlan(await explainPlan(ctx.db, query.compile()))
    expect(nodes.map((node) => node['Node Type'])).not.toContain('Seq Scan')
    expect(nodes.find((node) => node['Relation Name'] === 'listings')?.['Node Type']).toMatch(/Index/)
    expect(await query.execute()).toHaveLength(25)
  })

  it('refuses the same filter on an unindexed column, naming it and the index to add', async () => {
    expect(await uncovered('for_sale = true AND status = "available" AND city = "city-7"', [['published_at', 'desc']])).toEqual([
      { field: 'city', column: 'city', use: 'filter', need: 'btree', suggestion: 'create index on "listings" ("city")' },
    ])
  })

  it('needs every key before a column to be pinned by = or in', async () => {
    expect(await uncovered('status = "available"')).toMatchObject([{ field: 'status' }])
    expect(await uncovered('for_sale = true AND status != "sold"')).toEqual([])
    expect(await uncovered('for_sale = true', [['published_at', 'desc']])).toMatchObject([{ field: 'published_at', use: 'sort' }])
    expect(await uncovered(undefined, [['price', 'asc']])).toMatchObject([{ field: 'price', use: 'sort' }])
    expect(await uncovered('in(org, 1, 2) AND price < 100', [['price', 'asc']])).toEqual([])
  })

  it('pins nothing across OR branches or under NOT', async () => {
    expect(await uncovered('for_sale = true OR for_rent = true')).toEqual([])
    expect(await uncovered('(for_sale = true AND status = "sold") OR (for_rent = true AND status = "sold")')).toEqual([])
    expect(await uncovered('for_sale = true OR for_rent = true', [['published_at', 'desc']])).toMatchObject([{ field: 'published_at', use: 'sort' }])
    expect(await uncovered('NOT (for_sale = true AND status = "sold")')).toMatchObject([{ field: 'status' }])
  })

  it('counts the tenant column as pinned', async () => {
    const tenanted = { ...listings, tenant: 'org' }
    expect(await uncovered('price > 10', undefined, tenanted)).toEqual([])
    expect(await uncovered('price > 10')).toMatchObject([{ field: 'price' }])
  })

  it('does not count a partial index', async () => {
    expect(await uncovered('status = "available" AND city = "city-7"')).toMatchObject([{ field: 'status' }, { field: 'city' }])
  })

  it('needs a trigram index for patterns, regex and search, and a GIN index for JSON', async () => {
    expect(await uncovered('title = "*12*"')).toEqual([])
    expect(await uncovered('city = "city-1*"')).toEqual([
      { field: 'city', column: 'city', use: 'filter', need: 'trigram', suggestion: 'create index on "listings" using gin ("city" gin_trgm_ops)' },
    ])
    expect(await uncovered('regex(city, "^c")')).toMatchObject([{ field: 'city', need: 'trigram' }])
    expect(await uncovered('attrs:"gold"')).toEqual([])
    expect(await uncovered('"listing 12"')).toEqual([
      { field: 'phone', column: 'phone', use: 'filter', need: 'digits', suggestion: `create index on "listings" using gin ((regexp_replace("phone", '[^0-9]', '', 'g')) gin_trgm_ops)` },
    ])
    await ctx.pg.exec(`create index listings_phone_idx on listings using gin ((regexp_replace(phone, '[^0-9]', '', 'g')) gin_trgm_ops)`)
    expect(await uncovered('"listing 12"')).toEqual([])
    await ctx.pg.exec('drop index listings_phone_idx')
  })

  it('judges the access row filter as well', async () => {
    const indexes = await tableIndexes(ctx.db, listings)
    const scope = { rowFilter: check(listings, 'city = "city-1"') }
    expect(uncoveredColumns(listings, indexes, {}, scope)).toMatchObject([{ field: 'city', use: 'access' }])
    expect(uncoveredColumns(listings, indexes, { filter: check(listings, 'price < 5') }, { rowFilter: check(listings, 'org = 1') })).toEqual([])
  })

  it('needs a btree index on a grouped field', async () => {
    const indexes = await tableIndexes(ctx.db, listings)
    expect(uncoveredColumns(listings, indexes, { groupBy: 'city' })).toMatchObject([{ field: 'city', use: 'facet' }])
    expect(uncoveredColumns(listings, indexes, { groupBy: 'for_sale' })).toEqual([])
  })

  it('does not judge a plain view, which has no indexes of its own', async () => {
    const view = model('listing_titles', ['id'], [field('id', 'integer'), field('title', 'text')])
    expect(await tableIndexes(ctx.db, view)).toEqual({ kind: 'other', indexes: [] })
    expect(await uncovered('title = "x"', undefined, view)).toEqual([])
  })
})
