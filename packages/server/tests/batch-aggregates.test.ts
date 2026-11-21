import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { as, createFixtureDb, createTestApp, json, type TestApp } from '../../../test-support/server'

let fixture: Awaited<ReturnType<typeof createFixtureDb>>
let app: TestApp
beforeAll(async () => {
  fixture = await createFixtureDb()
  app = createTestApp(fixture)
})
afterAll(async () => { await fixture.db.destroy() })

const get = async (path: string, headers = as(1)) => (await app.request(`/api/v1${path}`, { headers })).json()
const batch = (path: string, body: unknown, headers = as(1)) => app.request(`/api/v1${path}:batchAggregates`, json(body, headers))

const filter = 'status = "won" AND revenue < 500'
const q = encodeURIComponent(filter)
const range = { from: '2026-01-01T00:00:00Z', to: '2026-01-08T00:00:00Z' }

describe(':batchAggregates', () => {
  it('answers each read as its own method does, in request order', async () => {
    const response = await batch('/companies', {
      facets: [{ field: 'status', filter, limit: 2 }, { field: 'organizationId', filter }],
      histograms: [{ field: 'revenue', filter, buckets: 5 }, { field: 'revenue', buckets: 1 }],
      series: [{ field: 'createdAt', filter, ...range, granularity: 'day', time_zone: 'Europe/Amsterdam' }],
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      facets: [await get(`/companies:facets?field=status&filter=${q}&limit=2`), await get(`/companies:facets?field=organizationId&filter=${q}`)],
      histograms: [await get(`/companies:histogram?field=revenue&filter=${q}&buckets=5`), await get('/companies:histogram?field=revenue&buckets=1')],
      series: [await get(`/companies:series?field=createdAt&filter=${q}&from=${range.from}&to=${range.to}&granularity=day&time_zone=Europe/Amsterdam`)],
    })
  })

  it("keeps to the caller's tenant and row filter", async () => {
    const sales = as(1, 'sales')
    const read = await (await batch('/companies', { facets: [{ field: 'status' }], histograms: [{ field: 'revenue' }] }, sales)).json()
    expect(read.facets).toEqual([await get('/companies:facets?field=status', sales)])
    expect(read.histograms).toEqual([await get('/companies:histogram?field=revenue', sales)])
    const other = await (await batch('/companies', { facets: [{ field: 'status' }] }, as(2))).json()
    expect(other.facets).toEqual([await get('/companies:facets?field=status', as(2))])
  })

  it('keeps to the record a list belongs to', async () => {
    const read = await (await batch('/labels/1/lineItems', { facets: [{ field: 'labelId' }] })).json()
    expect(read.facets).toEqual([await get('/labels/1/lineItems:facets?field=labelId')])
    expect(read.facets[0].facets).toEqual([{ value: 1, count: expect.any(Number) }])
  })

  it('refuses what its methods refuse', async () => {
    expect((await batch('/companies', { facets: [{ field: 'notes' }] })).status).toBe(400)
    expect((await batch('/companies', { histograms: [{ field: 'name' }] })).status).toBe(400)
    expect((await batch('/companies', { series: [{ field: 'createdAt', granularity: 'century' }] })).status).toBe(400)
    const unindexed = await app.request('/api/v1/events:batchAggregates', json({ facets: [{ field: 'kind' }] }, as(undefined)))
    expect(await unindexed.json()).toMatchObject({ status: 400, type: 'urn:protobase:problem:expensive-query', suggestion: 'create index on "events" ("kind")' })
  })
})
