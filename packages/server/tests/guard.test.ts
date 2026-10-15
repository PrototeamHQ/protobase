import { Kysely } from 'kysely'
import { PGliteDialect } from 'kysely-pglite-dialect'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { createAdmin } from '../src/create-admin'
import { as, createFixtureDb, createTestApp, testAuthenticator } from '../../../test-support/server'
import { createEmptyPg } from '../../../test-support/pglite-snapshot'

let fixture: Awaited<ReturnType<typeof createFixtureDb>>
beforeAll(async () => { fixture = await createFixtureDb() })
afterAll(async () => { await fixture.db.destroy() })

const list = (app: ReturnType<typeof createTestApp>, query: string) => app.request(`/api/v1/events?${query}`, { headers: as(undefined) })

describe('scan guard', () => {
  it('rejects a filter on a column no index serves, naming the column and the index to add', async () => {
    const app = createTestApp(fixture)
    const response = await list(app, 'filter=kind%20%3D%20%22k1%22')
    const problem = await response.json()
    expect(response.status).toBe(400)
    expect(problem).toMatchObject({ type: 'urn:protobase:problem:expensive-query', suggestion: 'create index on "events" ("kind")' })
    expect(problem.detail).toBe('Filtering on "kind" needs an index that serves the column "kind". Add one, for example: create index on "events" ("kind")')
    expect(problem.columns).toEqual([{ field: 'kind', column: 'kind', use: 'filter', need: 'btree', suggestion: 'create index on "events" ("kind")' }])
  })

  it('reads the indexes of a table once', async () => {
    const app = createTestApp(fixture)
    expect((await list(app, 'filter=kind%20%3D%20%22k1%22')).status).toBe(400)
    await fixture.pg.exec('create index events_kind_idx on events (kind)')
    expect((await list(app, 'filter=kind%20%3D%20%22k2%22')).status).toBe(400)
    expect((await list(createTestApp(fixture), 'filter=kind%20%3D%20%22k2%22')).status).toBe(200)
    await fixture.pg.exec('drop index events_kind_idx')
  })

  it('rejects an unindexed sort the same way', async () => {
    const response = await list(createTestApp(fixture), 'order_by=at%20desc&page_size=5')
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ suggestion: 'create index on "events" ("at")', detail: expect.stringMatching(/^Sorting by "at"/) })
  })

  it('passes an indexed shape', async () => {
    const response = await list(createTestApp(fixture), 'filter=id%20%3E%2029000&page_size=5')
    expect(response.status).toBe(200)
  })

  it('only warns in warn mode', async () => {
    const response = await list(createTestApp(fixture, { scanGuard: { mode: 'warn' } }), 'filter=kind%20%3D%20%22k1%22&page_size=2')
    expect(response.status).toBe(200)
    expect(response.headers.get('x-protobase-warning')).toContain('create index')
  })

  it('does nothing when off', async () => {
    expect((await list(createTestApp(fixture, { scanGuard: { mode: 'off' } }), 'filter=kind%20%3D%20%22k1%22&page_size=2')).status).toBe(200)
  })

  it('judges a facet count by its field and the rest of the filter', async () => {
    const facets = (query: string) => createTestApp(fixture).request(`/api/v1/events:facets?${query}`, { headers: as(undefined) })
    expect(await (await facets('field=kind')).json()).toMatchObject({ status: 400, detail: expect.stringMatching(/^Counting the values of "kind"/) })
    expect((await facets('field=id&filter=kind%20%3D%20%22k1%22')).status).toBe(400)
    expect((await facets('field=id&filter=id%20%3E%2029990')).status).toBe(200)
  })
})

// The property-finder case: about 60% of the listings are for sale or for rent, and the home page lists those of one
// offer that are available, newest first, through (for_sale | for_rent, status, published_at desc).
describe('scan guard on a broad filter that an index serves', () => {
  const listings = resource('listings')
    .table('listings')
    .fields({
      id: f.integer().readOnly().filterable().sortable(),
      for_sale: f.boolean().filterable(),
      for_rent: f.boolean().filterable(),
      status: f.text().filterable(),
      published_at: f.timestamp().filterable().sortable(),
      city: f.text().filterable(),
    })
    .primaryKey((r) => r.id)

  let pg: Awaited<ReturnType<typeof createEmptyPg>>
  let app: ReturnType<typeof createAdmin>
  beforeAll(async () => {
    pg = await createEmptyPg()
    await pg.exec(`
      create table listings (id integer primary key, for_sale boolean not null, for_rent boolean not null, status text not null, published_at timestamptz not null, city text not null);
      insert into listings select i, i % 10 < 4, i % 10 between 4 and 5, (array['available', 'sold'])[1 + i % 2], timestamptz '2026-01-01+00' + i * interval '1 minute', 'city-' || i % 50
        from generate_series(1, 15000) i;
      create index listings_sale_idx on listings (for_sale, status, published_at desc);
      create index listings_rent_idx on listings (for_rent, status, published_at desc);
      analyze listings;
    `)
    app = createAdmin({ resources: [listings], db: new Kysely<any>({ dialect: new PGliteDialect(pg) }), authenticate: testAuthenticator })
  })
  afterAll(async () => { await pg.close() })

  const page = (filter: string) =>
    app.request(`/api/v1/listings?${new URLSearchParams({ filter, order_by: 'published_at desc', page_size: '12', count: 'exact' })}`, { headers: as(undefined) })

  it('lists them without raising any limit, with an exact count', async () => {
    const response = await page('for_sale = true AND status = "available"')
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.items).toHaveLength(12)
    expect(body.items[0]).toMatchObject({ id: 15000, for_sale: true, status: 'available' })
    expect(body.total_size).toBe(3000)
  })

  it('refuses the same filter on an unindexed column', async () => {
    const response = await page('for_sale = true AND status = "available" AND city = "city-2"')
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ suggestion: 'create index on "listings" ("city")', columns: [{ field: 'city', use: 'filter' }] })
  })
})
