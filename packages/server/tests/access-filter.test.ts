import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { as, createFixtureDb, createTestApp, json, type TestApp } from '../../../test-support/server'

let fixture: Awaited<ReturnType<typeof createFixtureDb>>
let app: TestApp
beforeAll(async () => {
  fixture = await createFixtureDb()
  app = createTestApp(fixture)
})
afterAll(async () => { await fixture.db.destroy() })

const restricted = as(1, 'restricted')
const names = async () => (await fixture.pg.query<{ name: string }>('select name from labels order by id')).rows.map((row) => row.name)

describe('filter-returning access rules on writes (a regex rule, checked in the database)', () => {
  it('lets a create through when the new row matches', async () => {
    expect((await app.request('/api/v1/labels', json({ name: 'ok-1' }, restricted))).status).toBe(201)
  })

  it('refuses a create whose row does not match, and rolls it back', async () => {
    const response = await app.request('/api/v1/labels', json({ name: 'bad' }, restricted))
    expect(response.status).toBe(403)
    expect(await names()).not.toContain('bad')
  })

  it('refuses an update into a forbidden state, keeping the old row', async () => {
    const created = await (await app.request('/api/v1/labels', json({ name: 'ok-2' }, as(1)))).json()
    const read = await app.request(`/api/v1/labels/${created.id}`, { headers: as(1) })
    const patch = (name: string, etag: string) => app.request(`/api/v1/labels/${created.id}`, {
      method: 'PATCH', body: JSON.stringify({ name }), headers: { ...restricted, 'if-match': etag, 'content-type': 'application/json' },
    })
    const refused = await patch('bad-name', read.headers.get('etag')!)
    expect(refused.status).toBe(403)
    expect(await names()).toContain('ok-2')
    const allowed = await patch('ok-3', read.headers.get('etag')!)
    expect(allowed.status).toBe(200)
  })

  it('treats a row that does not match before the update as missing', async () => {
    const etag = (await app.request('/api/v1/labels/1', { headers: as(1) })).headers.get('etag')!
    const response = await app.request('/api/v1/labels/1', {
      method: 'PATCH', body: JSON.stringify({ name: 'ok-9' }), headers: { ...restricted, 'if-match': etag, 'content-type': 'application/json' },
    })
    expect(response.status).toBe(404)
  })
})
