import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { KyselyPlugin, RootOperationNode } from 'kysely'
import { as, createFixtureDb, createTestApp, json, type TestApp } from '../../../test-support/server'

let fixture: Awaited<ReturnType<typeof createFixtureDb>>
let app: TestApp
// Every query the app builds, to read which columns a list selects
const built: RootOperationNode[] = []
const spy: KyselyPlugin = {
  transformQuery: ({ node }) => (built.push(node), node),
  transformResult: async ({ result }) => result,
}
beforeAll(async () => {
  fixture = await createFixtureDb()
  app = createTestApp({ ...fixture, db: fixture.db.withPlugin(spy) })
})
afterAll(async () => { await fixture.db.destroy() })

// The query that reads the labels themselves, compiled
const labelsRead = () => {
  const sql = built.map((node) => fixture.db.getExecutor().compileQuery(node, { queryId: 'spy' }).sql).filter((text) => /from "labels"/.test(text) && !/count\(/.test(text))
  built.length = 0
  return sql[0]!
}

const get = (path: string) => app.request(`/api/v1${path}`, { headers: as(1) })

// Labels have no version column, so their ETags hash every readable field
describe('etag=false', () => {
  it('reads only the selected fields of a list and leaves etag out', async () => {
    built.length = 0
    const body = await (await get('/labels?page_size=2&fields=id,name&etag=false')).json()
    expect(Object.keys(body.items[0]).sort()).toEqual(['id', 'name', 'permissions'])
    expect(labelsRead()).not.toMatch(/"color"|"code"/)
  })

  it('reads every field without it, to hash the ETag', async () => {
    built.length = 0
    const body = await (await get('/labels?page_size=2&fields=id,name')).json()
    expect(Object.keys(body.items[0]).sort()).toEqual(['etag', 'id', 'name', 'permissions'])
    expect(labelsRead()).toMatch(/"color".*"code"|"code".*"color"/)
    expect((await (await get('/labels?page_size=2&fields=id,name&etag=true')).json()).items[0]).toHaveProperty('etag')
  })

  it('does the same in a :search body', async () => {
    built.length = 0
    const body = await (await app.request('/api/v1/labels:search', json({ page_size: 2, fields: ['id', 'name'], etag: false }, as(1)))).json()
    expect(Object.keys(body.items[0]).sort()).toEqual(['id', 'name', 'permissions'])
    expect(labelsRead()).not.toMatch(/"color"|"code"/)
  })

  it('reads the key for row permissions, though fields leaves it out', async () => {
    // The restricted role updates only labels named ok-..., which the database decides by each row's key
    const restricted = as(1, 'restricted')
    expect((await app.request('/api/v1/labels', json({ name: 'ok-etag' }, restricted))).status).toBe(201)
    const body = await (await app.request('/api/v1/labels?page_size=10&fields=name&etag=false', { headers: restricted })).json()
    const update = Object.fromEntries(body.items.map((item: { name: string; permissions: { update: boolean } }) => [item.name, item.permissions.update]))
    expect(update).toMatchObject({ 'ok-etag': true, urgent: false })
    expect(Object.keys(body.items[0]).sort()).toEqual(['name', 'permissions'])
  })

  it('refuses a value other than true or false, naming them', async () => {
    const response = await get('/labels?etag=no')
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.errors[0].parameter).toBe('etag')
    expect(body.errors[0].message).toBe('Expected true or false')
  })
})
