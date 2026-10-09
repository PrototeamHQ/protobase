import { Validator } from '@seriousme/openapi-schema-validator'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { as, createFixtureDb, createTestApp, json, type TestApp } from '../../../test-support/server'

let fixture: Awaited<ReturnType<typeof createFixtureDb>>
let app: TestApp
beforeAll(async () => {
  fixture = await createFixtureDb()
  app = createTestApp(fixture)
})
afterAll(async () => { await fixture.db.destroy() })

const call = (path: string, init: RequestInit = {}, org = 1, roles = 'admin') =>
  app.request(`/api/v1${path}`, { ...init, headers: { ...as(org, roles), ...(init.headers as Record<string, string>) } })

describe('POST /{resource}/{key}:undelete (AIP-164)', () => {
  it('restores a soft-deleted record with a new ETag, without If-Match', async () => {
    const before = (await call('/companies/30')).headers.get('etag')
    expect((await call('/companies/30', { method: 'DELETE' })).status).toBe(204)
    expect((await call('/companies/30')).status).toBe(404)
    const response = await call('/companies/30:undelete', { method: 'POST' })
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({ id: 30, deletedAt: null })
    expect(response.headers.get('etag')).toBe(body.etag)
    expect(body.etag).not.toBe(before)
    expect((await call('/companies/30')).status).toBe(200)
  })

  it('honors If-Match', async () => {
    await call('/companies/31', { method: 'DELETE' })
    const stale = await call('/companies/31:undelete', { method: 'POST', headers: { 'if-match': '"stale"' } })
    expect(stale.status).toBe(412)
    expect((await call('/companies/31')).status).toBe(404)
    expect((await call('/companies/31:undelete', { method: 'POST', headers: { 'if-match': '*' } })).status).toBe(200)
  })

  it('is a 409 for a record that is not deleted and a 404 for a missing or foreign one', async () => {
    const live = await call('/companies/32:undelete', { method: 'POST' })
    expect(live.status).toBe(409)
    expect((await live.json()).type).toBe('urn:protobase:problem:not-deleted')
    expect((await call('/companies/999999:undelete', { method: 'POST' })).status).toBe(404)
    await call('/companies/33', { method: 'DELETE' })
    expect((await call('/companies/33:undelete', { method: 'POST' }, 2)).status).toBe(404)
  })

  it('is refused by the access rule, and unsupported for hard-delete resources', async () => {
    await call('/companies/34', { method: 'DELETE' })
    const created = await (await call('/labels', json({ name: 'x' }))).json()
    expect((await call(`/labels/${created.id}:undelete`, { method: 'POST' })).status).toBe(400)
    expect((await call('/companies/34:undelete', { method: 'POST' })).status).toBe(200)
  })

  it('runs the write hooks as an undelete', async () => {
    const events: string[] = []
    const hooked = createTestApp(fixture, {}, [async (event) => { events.push(event.operation) }])
    await hooked.request('/api/v1/companies/35', { method: 'DELETE', headers: as(1) })
    await hooked.request('/api/v1/companies/35:undelete', { method: 'POST', headers: as(1) })
    expect(events).toEqual(['delete', 'undelete'])
  })
})

describe('show_deleted', () => {
  it('lists deleted records too, on list, search and get', async () => {
    await call('/companies/40', { method: 'DELETE' })
    const hidden = await (await call('/companies?filter=id%20%3D%2040')).json()
    expect(hidden.items).toHaveLength(0)
    const shown = await (await call('/companies?filter=id%20%3D%2040&show_deleted=true&count=exact')).json()
    expect(shown.items).toHaveLength(1)
    expect(shown.items[0].deletedAt).not.toBeNull()
    expect(shown.total_size).toBe(1)
    const search = await (await call('/companies:search', json({ filter: 'id = 40', show_deleted: true }, as(1)))).json()
    expect(search.items).toHaveLength(1)
    expect((await call('/companies/40')).status).toBe(404)
    expect((await (await call('/companies/40?show_deleted=true')).json()).id).toBe(40)
  })

  it('stays inside the tenant and is refused on hard-delete resources', async () => {
    const other = await (await call('/companies?filter=id%20%3D%203401&show_deleted=true', {}, 1)).json()
    expect(other.items).toHaveLength(0)
    expect((await call('/labels?show_deleted=true')).status).toBe(400)
  })
})

describe('database defaults', () => {
  it('leave the field out of create and out of the OpenAPI required list', async () => {
    const created = await (await call('/labels', json({ name: 'with default' }))).json()
    expect(created.code).toMatch(/^[0-9a-f]{32}$/)
    const document = await (await app.request('/api/openapi.json', { headers: as(1) })).json()
    expect(document.components.schemas.LabelsCreate.required).toEqual(['name'])
    expect(document.components.schemas.LabelsCreate.properties.code.description).toContain('database')
    expect(document.components.schemas.Companies.properties.status.default).toBe('open')
  })

  it('keeps the OpenAPI document valid with undelete and show_deleted', async () => {
    const document = await (await app.request('/api/openapi.json', { headers: as(1) })).json()
    expect(document.paths['/companies/{key}:undelete']).toBeDefined()
    expect(document.paths['/labels/{key}:undelete']).toBeUndefined()
    expect((await new Validator().validate(document)).valid).toBe(true)
  })
})
