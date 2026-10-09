import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { as, createFixtureDb, createTestApp, json, type TestApp } from '../../../test-support/server'

let fixture: Awaited<ReturnType<typeof createFixtureDb>>
let app: TestApp
beforeAll(async () => {
  fixture = await createFixtureDb()
  app = createTestApp(fixture)
})
afterAll(async () => { await fixture.db.destroy() })

const request = (path: string, init: RequestInit & { headers?: Record<string, string> } = {}, org = 1, roles = 'admin') =>
  app.request(`/api/v1${path}`, { ...init, headers: { ...as(org, roles), ...init.headers } })

const patch = (path: string, body: unknown, headers: Record<string, string> = {}, org = 1) =>
  request(path, { method: 'PATCH', body: JSON.stringify(body), headers: { 'content-type': 'application/json', ...headers } }, org)

describe('GET /{resource}/{key}', () => {
  it('returns the record with an ETag and honors fields', async () => {
    const response = await request('/companies/1')
    expect(response.status).toBe(200)
    expect(response.headers.get('etag')).toMatch(/^"t/)
    expect(await response.json()).toMatchObject({ id: 1, name: 'Company 1' })
    const partial = await (await request('/companies/1?fields=name')).json()
    expect(partial).toMatchObject({ name: 'Company 1', etag: expect.any(String) })
    expect(Object.keys(partial).sort()).toEqual(['etag', 'name', 'permissions'])
  })

  it('is a 404 for a missing, soft-deleted or malformed-but-valid key', async () => {
    expect((await request('/companies/999999')).status).toBe(404)
    expect((await request('/companies/100')).status).toBe(404)
    const problem = await (await request('/companies/999999')).json()
    expect(problem).toMatchObject({ type: 'urn:protobase:problem:not-found', status: 404 })
  })

  it('is a 400 for a key of the wrong type', async () => {
    expect((await request('/companies/abc')).status).toBe(400)
  })

  it('resolves composite keys, with relation key parts typed through their target', async () => {
    const found = await (await request('/lineItems/1,2')).json()
    expect(found).toMatchObject({ labelId: 1, lineNo: 2, quantity: 7 })
    expect((await request('/lineItems/1,99')).status).toBe(404)
    expect((await request('/lineItems/1')).status).toBe(400)
    expect((await request('/lineItems/x,1')).status).toBe(400)
  })
})

describe('POST /{resource}', () => {
  it('creates with the caller tenant, defaults and a Location', async () => {
    const response = await request('/companies', json({ name: 'New Co', meta: { tier: 1 } }))
    const body = await response.json()
    expect(response.status).toBe(201)
    expect(response.headers.get('location')).toBe(`/api/v1/companies/${body.id}`)
    expect(response.headers.get('etag')).toBeTruthy()
    expect(body).toMatchObject({ name: 'New Co', organizationId: 1, status: 'open', revenue: '0.00', notes: null, meta: { tier: 1 } })
  })

  it('creates a record with a composite key', async () => {
    const response = await request('/lineItems', json({ labelId: 2, lineNo: 1, quantity: 3 }))
    expect(response.status).toBe(201)
    expect(response.headers.get('location')).toBe('/api/v1/lineItems/2,1')
  })

  it('honors Prefer: return=minimal', async () => {
    const response = await request('/companies', json({ name: 'Quiet' }, { prefer: 'return=minimal' }))
    expect(response.status).toBe(201)
    expect(await response.text()).toBe('')
    expect(response.headers.get('preference-applied')).toBe('return=minimal')
  })

  it('reports field level errors', async () => {
    const response = await request('/companies', json({ status: 'bogus', revenue: '1.234', extra: 1, id: 5, organizationId: 2 }))
    const problem = await response.json()
    expect(response.status).toBe(400)
    expect(problem.type).toBe('urn:protobase:problem:invalid-record')
    expect(problem.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'extra', code: 'unknown-field' }),
      expect.objectContaining({ field: 'id', code: 'read-only' }),
      expect.objectContaining({ field: 'organizationId', code: 'read-only' }),
    ]))
    const values = await (await request('/companies', json({ status: 'bogus', revenue: '1.234' }))).json()
    expect(values.errors.map((e: { field: string; code: string }) => `${e.field}:${e.code}`).sort()).toEqual(['name:required', 'revenue:invalid-value', 'status:invalid-value'])
  })

  it('runs .validate() rules', async () => {
    const problem = await (await request('/companies', json({ name: 'forbidden' }))).json()
    expect(problem.errors).toEqual([{ field: 'name', code: 'invalid-record', message: 'That name is not allowed' }])
  })

  it('rejects a body that is not an object', async () => {
    expect((await request('/companies', json([1]))).status).toBe(400)
  })

  it('answers a database constraint with a 409 and no raw message', async () => {
    const response = await request('/lineItems', json({ labelId: 1, lineNo: 1, quantity: 1 }))
    const problem = await response.json()
    expect(response.status).toBe(409)
    expect(problem.detail).not.toMatch(/duplicate key/)
  })
})

describe('PATCH /{resource}/{key}', () => {
  it('needs If-Match', async () => {
    expect((await patch('/companies/2', { name: 'x' })).status).toBe(428)
  })

  it('updates with the current ETag and moves the ETag on', async () => {
    const etag = (await request('/companies/2')).headers.get('etag')!
    const response = await patch('/companies/2', { name: 'Renamed' }, { 'if-match': etag })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ id: 2, name: 'Renamed', status: 'lost' })
    expect(response.headers.get('etag')).not.toBe(etag)
  })

  it('answers a stale ETag with 412', async () => {
    const etag = (await request('/companies/3')).headers.get('etag')!
    await patch('/companies/3', { name: 'First' }, { 'if-match': etag })
    const stale = await patch('/companies/3', { name: 'Second' }, { 'if-match': etag })
    expect(stale.status).toBe(412)
    expect((await request('/companies/3')).headers.get('etag')).not.toBe(etag)
    expect(await (await request('/companies/3')).json()).toMatchObject({ name: 'First' })
  })

  it('leaves fields it was not sent alone, defaults included', async () => {
    const etag = (await request('/companies/4')).headers.get('etag')!
    const before = await (await request('/companies/4')).json()
    const after = await (await patch('/companies/4', { notes: 'hello' }, { 'if-match': etag })).json()
    expect(after).toMatchObject({ notes: 'hello', status: before.status, revenue: before.revenue })
  })

  it('refuses read-only fields and invalid values', async () => {
    const etag = (await request('/companies/5')).headers.get('etag')!
    expect((await patch('/companies/5', { createdAt: '2020-01-01T00:00:00Z' }, { 'if-match': etag })).status).toBe(400)
    expect((await patch('/companies/5', { status: 'bogus' }, { 'if-match': etag })).status).toBe(400)
  })

  it('is a 404 for a missing record', async () => {
    expect((await patch('/companies/999999', { name: 'x' }, { 'if-match': '"t"' })).status).toBe(404)
  })

  it('supports Prefer: return=minimal', async () => {
    const etag = (await request('/companies/6')).headers.get('etag')!
    const response = await patch('/companies/6', { name: 'Quiet' }, { 'if-match': etag, prefer: 'return=minimal' })
    expect(response.status).toBe(204)
  })

  it('hashes the row for ETags when the table has no version column', async () => {
    const first = await request('/labels/1')
    const etag = first.headers.get('etag')!
    expect(etag).toMatch(/^"h/)
    const updated = await patch('/labels/1', { color: 'green' }, { 'if-match': etag })
    expect(updated.status).toBe(200)
    expect(updated.headers.get('etag')).not.toBe(etag)
    expect((await patch('/labels/1', { color: 'blue' }, { 'if-match': etag })).status).toBe(412)
  })
})

describe('DELETE /{resource}/{key}', () => {
  const remove = (path: string, ifMatch?: string, extra: Record<string, string> = {}, org = 1, roles = 'admin') =>
    request(path, { method: 'DELETE', headers: { ...(ifMatch && { 'if-match': ifMatch }), ...extra } }, org, roles)

  it('deletes the current version without If-Match', async () => {
    expect((await remove('/companies/13')).status).toBe(204)
    expect((await request('/companies/13')).status).toBe(404)
  })

  it('answers a stale If-Match with 412 and keeps the record', async () => {
    expect((await remove('/companies/8', '"stale"')).status).toBe(412)
    expect((await request('/companies/8')).status).toBe(200)
  })

  it('soft deletes with the current ETag and hides the row', async () => {
    const etag = (await request('/companies/7')).headers.get('etag')!
    expect((await remove('/companies/7', etag)).status).toBe(204)
    expect((await request('/companies/7')).status).toBe(404)
    const row = (await fixture.pg.query<{ deleted_at: string | null }>('select deleted_at from companies where id = 7')).rows[0]!
    expect(row.deleted_at).not.toBeNull()
  })

  it('treats If-Match: * as any version', async () => {
    expect((await remove('/companies/10', '*')).status).toBe(204)
    expect((await request('/companies/10')).status).toBe(404)
  })

  it('deletes rows for real without a soft delete column', async () => {
    expect((await remove('/labels/2', '*')).status).toBe(204)
    expect((await fixture.pg.query('select 1 from labels where id = 2')).rows).toHaveLength(0)
  })

  it('is refused by the access rule for non-admins', async () => {
    expect((await remove('/companies/9', '*', {}, 1, 'viewer')).status).toBe(403)
    expect((await request('/companies/9')).status).toBe(200)
  })

  it('can return the deleted record', async () => {
    const response = await remove('/lineItems/2,1', '*', { prefer: 'return=representation' })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ labelId: 2, lineNo: 1 })
  })
})

describe.each([
  ['soft-delete resource', 'companies', { name: 'Renamed once' }],
  ['hard-delete resource', 'labels', { color: 'purple' }],
])('delete with an outdated version: %s', (_, resourceName, change) => {
  const create = async () => ((await (await request(`/${resourceName}`, json({ name: 'to delete' }))).json()) as { id: number }).id

  it('is a 412 problem that keeps the updated record, then the current etag and * delete it', async () => {
    const id = await create()
    const path = `/${resourceName}/${id}`
    const outdated = (await request(path)).headers.get('etag')!
    const updated = await patch(path, change, { 'if-match': outdated })
    expect(updated.status).toBe(200)
    const current = updated.headers.get('etag')!
    expect(current).not.toBe(outdated)

    const refused = await request(path, { method: 'DELETE', headers: { 'if-match': outdated } })
    expect(refused.status).toBe(412)
    expect(refused.headers.get('content-type')).toContain('application/problem+json')
    expect((await refused.json()).type).toBe('urn:protobase:problem:precondition-failed')

    const kept = await request(path)
    expect(kept.status).toBe(200)
    expect(await kept.json()).toMatchObject(change)
    const stored = (await fixture.pg.query<Record<string, unknown>>(`select * from ${resourceName === 'companies' ? 'companies' : 'labels'} where id = ${id}`)).rows
    expect(stored).toHaveLength(1)
    if (resourceName === 'companies') expect(stored[0]!.deleted_at).toBeNull()

    expect((await request(path, { method: 'DELETE', headers: { 'if-match': current } })).status).toBe(204)
  })

  it('deletes with If-Match: * whatever the version', async () => {
    const other = `/${resourceName}/${await create()}`
    expect((await request(other)).status).toBe(200)
    expect((await request(other, { method: 'DELETE', headers: { 'if-match': '*' } })).status).toBe(204)
  })
})

describe('etags keep microsecond precision', () => {
  it('differ for two writes within the same millisecond, in get, list and PATCH', async () => {
    await fixture.pg.exec("update companies set updated_at = timestamptz '2026-03-01 10:00:00.123100+00' where id = 15")
    const first = (await request('/companies/15')).headers.get('etag')!
    const listedFirst = (await (await request('/companies?filter=id%20%3D%2015')).json()).items[0].etag
    await fixture.pg.exec("update companies set updated_at = timestamptz '2026-03-01 10:00:00.123200+00' where id = 15")
    const second = (await request('/companies/15')).headers.get('etag')!
    const listedSecond = (await (await request('/companies?filter=id%20%3D%2015')).json()).items[0].etag
    expect(second).not.toBe(first)
    expect(listedFirst).toBe(first)
    expect(listedSecond).toBe(second)
    expect((await patch('/companies/15', { name: 'late' }, { 'if-match': first })).status).toBe(412)
    expect((await patch('/companies/15', { name: 'on time' }, { 'if-match': second })).status).toBe(200)
  })
})

describe('the etag property', () => {
  it('is in get, list and search items with the value of the ETag header', async () => {
    const got = await request('/companies/11')
    const etag = got.headers.get('etag')
    expect((await got.json()).etag).toBe(etag)
    const listed = await (await request('/companies?filter=id%20%3D%2011')).json()
    expect(listed.items[0].etag).toBe(etag)
    const searched = await (await app.request('/api/v1/companies:search', json({ filter: 'id = 11', fields: ['name'] }, as(1)))).json()
    expect(searched.items[0]).toMatchObject({ name: 'Company 11', etag })
  })

  it('is the hash for resources without a version column, also with fields', async () => {
    const etag = (await request('/labels/1')).headers.get('etag')
    const listed = await (await request('/labels?fields=name&order_by=id')).json()
    expect(listed.items[0]).toMatchObject({ name: expect.any(String), etag })
  })

  it('lets a list item be updated and deleted without a get', async () => {
    const created = await (await request('/labels', json({ name: 'row' }))).json()
    const [item] = (await (await request(`/labels?filter=id%20%3D%20${created.id}`)).json()).items
    const updated = await patch(`/labels/${created.id}`, { color: 'x' }, { 'if-match': item.etag })
    expect(updated.status).toBe(200)
    const after = (await updated.json()).etag
    expect((await request(`/labels/${created.id}`, { method: 'DELETE', headers: { 'if-match': item.etag } })).status).toBe(412)
    expect((await request(`/labels/${created.id}`, { method: 'DELETE', headers: { 'if-match': after } })).status).toBe(204)
  })

  it('is refused in a write body, pointing at If-Match', async () => {
    const response = await request('/companies', json({ name: 'x', etag: '"a"' }))
    const problem = await response.json()
    expect(response.status).toBe(400)
    expect(problem.errors[0]).toMatchObject({ field: 'etag', code: 'read-only' })
    expect(problem.errors[0].message).toContain('If-Match')
    const etag = (await request('/companies/12')).headers.get('etag')!
    expect((await patch('/companies/12', { etag }, { 'if-match': etag })).status).toBe(400)
  })
})
