import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { as, createFixtureDb, createTestApp, json, type TestApp } from '../../../test-support/server'

let fixture: Awaited<ReturnType<typeof createFixtureDb>>
let app: TestApp
beforeAll(async () => {
  fixture = await createFixtureDb()
  app = createTestApp(fixture)
})
afterAll(async () => { await fixture.db.destroy() })

const get = (path: string, org = 1, roles = 'admin') => app.request(`/api/v1${path}`, { headers: as(org, roles) })

describe('GET /{resource}', () => {
  it('lists a page with an estimate and the next token', async () => {
    const response = await get('/companies?page_size=2&order_by=id')
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body.items.map((item: { id: number }) => item.id)).toEqual([1, 2])
    expect(body.items[0]).toMatchObject({ name: 'Company 1', organizationId: 1, revenue: '1.00' })
    expect(typeof body.next_page_token).toBe('string')
    expect(body.next_page_token).not.toBe('')
    expect(body.total_size_estimate).toBeGreaterThan(0)
    expect(body).not.toHaveProperty('total_size')
    expect(response.headers.get('x-meta-version')).toMatch(/^[0-9a-f]{32}$/)
  })

  it('pages without gaps or duplicates and ends with an empty token', async () => {
    const seen: number[] = []
    let token = ''
    do {
      const body = await (await get(`/companies?page_size=500&order_by=createdAt%20desc&page_token=${encodeURIComponent(token)}`)).json()
      seen.push(...body.items.map((item: { id: number }) => item.id))
      token = body.next_page_token
    } while (token)
    expect(new Set(seen).size).toBe(seen.length)
    expect(seen).toHaveLength(2970)
  })

  it('returns an exact total on request', async () => {
    const body = await (await get('/companies?count=exact&page_size=1&filter=status%20%3D%20%22won%22')).json()
    const expected = (await fixture.pg.query<{ n: string }>(`select count(*)::text as n from companies where organization_id = 1 and deleted_at is null and status = 'won'`)).rows[0]!.n
    expect(body.total_size).toBe(Number(expected))
  })

  it('selects columns with fields', async () => {
    const body = await (await get('/companies?page_size=1&fields=id,name')).json()
    expect(Object.keys(body.items[0]).sort()).toEqual(['etag', 'id', 'name', 'permissions'])
  })

  it('rejects unknown fields in fields', async () => {
    const response = await get('/companies?fields=id,nope')
    expect(response.status).toBe(400)
    expect(response.headers.get('content-type')).toContain('application/problem+json')
  })

  it('answers an invalid filter with spans and hints', async () => {
    const response = await get('/companies?filter=status%20%3D')
    const problem = await response.json()
    expect(response.status).toBe(400)
    expect(response.headers.get('content-type')).toContain('application/problem+json')
    expect(problem).toMatchObject({ type: 'urn:protobase:problem:invalid-filter', status: 400, parameter: 'filter', instance: '/api/v1/companies' })
    expect(problem.errors[0]).toMatchObject({ code: expect.any(String), hint: expect.any(String), span: { start: expect.any(Number), end: expect.any(Number) } })
  })

  it('rejects a filter on a non-filterable field', async () => {
    const problem = await (await get('/companies?filter=notes%20%3D%20%22x%22')).json()
    expect(problem.errors[0].code).toBe('not-filterable')
  })

  it('rejects a sort on a non-sortable field', async () => {
    const response = await get('/companies?order_by=notes')
    expect(response.status).toBe(400)
    expect((await response.json()).errors[0].code).toBe('not-sortable')
  })

  it('rejects a malformed page size and token', async () => {
    expect((await get('/companies?page_size=-1')).status).toBe(400)
    expect((await get('/companies?page_token=garbage')).status).toBe(400)
  })

  it('coerces a page size above the maximum', async () => {
    const body = await (await get('/companies?page_size=100000')).json()
    expect(body.items).toHaveLength(500)
  })

  it('is a 404 for an unknown resource and an unknown method', async () => {
    expect((await get('/nothing')).status).toBe(404)
    expect((await get('/companies:explode')).status).toBe(404)
  })

  it('ANDs a filter returned by an access rule', async () => {
    const body = await (await get('/companies?page_size=500', 1, 'sales')).json()
    expect(body.items.length).toBeGreaterThan(0)
    expect(new Set(body.items.map((item: { status: string }) => item.status))).toEqual(new Set(['open']))
  })
})

describe('POST /{resource}:search', () => {
  it('takes a long in() list that would not fit a URL', async () => {
    const ids = Array.from({ length: 20000 }, (_, i) => i + 1)
    const response = await app.request('/api/v1/companies:search', json({ filter: `in(id, ${ids.join(", ")})`, page_size: 500, fields: ['id'], count: 'exact' }, as(1)))
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body.items).toHaveLength(500)
    expect(body.total_size).toBe(2970)
  })

  it('still caps filters in a query string', async () => {
    const ids = Array.from({ length: 3000 }, (_, i) => i + 1)
    const response = await app.request(`/api/v1/companies?filter=${encodeURIComponent(`in(id, ${ids.join(',')})`)}`, { headers: as(1) })
    expect(response.status).toBe(400)
    expect((await response.json()).errors[0].code).toBe('too-long')
  })

  it('reports filter errors like the GET', async () => {
    const response = await app.request('/api/v1/companies:search', json({ filter: 'status = ' }, as(1)))
    expect(response.status).toBe(400)
  })

  it('answers malformed JSON with a problem', async () => {
    const response = await app.request('/api/v1/companies:search', { method: 'POST', headers: as(1), body: '{nope' })
    expect(response.status).toBe(400)
    expect((await response.json()).type).toBe('urn:protobase:problem:malformed-json')
  })
})
