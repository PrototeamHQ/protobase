import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { as, createFixtureDb, createTestApp, json, type TestApp } from '../../../test-support/server'

let fixture: Awaited<ReturnType<typeof createFixtureDb>>
let app: TestApp
beforeAll(async () => {
  fixture = await createFixtureDb()
  app = createTestApp(fixture)
})
afterAll(async () => { await fixture.db.destroy() })

const request = (path: string, org: number | undefined, init: RequestInit = {}) =>
  app.request(`/api/v1${path}`, { ...init, headers: { ...as(org), ...(init.headers as Record<string, string>) } })

describe('tenant isolation between two organizations', () => {
  it('lists only the tenant rows', async () => {
    const one = await (await request('/companies?page_size=500&count=exact', 1)).json()
    const two = await (await request('/companies?page_size=500&count=exact', 2)).json()
    expect(one.total_size).toBe(2970)
    expect(two.total_size).toBe(500 - 5)
    expect(new Set(one.items.map((item: { organizationId: number }) => item.organizationId))).toEqual(new Set([1]))
    expect(new Set(two.items.map((item: { organizationId: number }) => item.organizationId))).toEqual(new Set([2]))
  })

  it('treats another tenant key as missing for read, update and delete', async () => {
    expect((await request('/companies/3401', 1)).status).toBe(404)
    expect((await request('/companies/3401', 2)).status).toBe(200)
    const etag = (await request('/companies/3401', 2)).headers.get('etag')!
    const update = await request('/companies/3401', 1, { method: 'PATCH', body: JSON.stringify({ name: 'Hijack' }), headers: { 'if-match': etag, 'content-type': 'application/json' } })
    expect(update.status).toBe(404)
    expect((await request('/companies/3401', 1, { method: 'DELETE' })).status).toBe(404)
    expect(await (await request('/companies/3401', 2)).json()).toMatchObject({ name: 'Company 3401' })
  })

  it('scopes composite keys and facets', async () => {
    expect((await request('/lineItems/1,1', 2)).status).toBe(404)
    expect((await request('/lineItems/3,1', 2)).status).toBe(200)
    const facets = await (await request('/companies:facets?field=status', 2)).json()
    expect(facets.facets.reduce((sum: number, row: { count: number }) => sum + row.count, 0)).toBe(495)
  })

  it('injects the tenant on create and refuses a body that sets it', async () => {
    const created = await (await request('/companies', 2, json({ name: 'Globex Co' }))).json()
    expect(created.organizationId).toBe(2)
    const refused = await request('/companies', 2, json({ name: 'x', organizationId: 1 }))
    expect(refused.status).toBe(400)
  })

  it('refuses a caller without a tenant on a tenant-scoped resource', async () => {
    const response = await request('/companies', undefined)
    expect(response.status).toBe(403)
    expect((await response.json()).type).toBe('urn:protobase:problem:tenant-required')
    expect((await request('/organizations', undefined)).status).toBe(200)
  })
})
