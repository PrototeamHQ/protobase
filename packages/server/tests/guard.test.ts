import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { as, createFixtureDb, createTestApp } from '../../../test-support/server'

let fixture: Awaited<ReturnType<typeof createFixtureDb>>
beforeAll(async () => { fixture = await createFixtureDb() })
afterAll(async () => { await fixture.db.destroy() })

const list = (app: ReturnType<typeof createTestApp>, query: string) => app.request(`/api/v1/events?${query}`, { headers: as(undefined) })

describe('scan guard', () => {
  it('rejects a filter that would scan a large table, suggesting the index', async () => {
    const app = createTestApp(fixture)
    const response = await list(app, 'filter=kind%20%3D%20%22k1%22')
    const problem = await response.json()
    expect(response.status).toBe(400)
    expect(problem).toMatchObject({ type: 'urn:protobase:problem:expensive-query', suggestion: 'create index on "events" ("kind")' })
    expect(problem.detail).toContain('create index on "events" ("kind")')
    expect(problem.findings[0]).toMatchObject({ kind: 'seqScan', relation: 'events' })
  })

  it('caches the verdict per query shape', async () => {
    const app = createTestApp(fixture)
    expect((await list(app, 'filter=kind%20%3D%20%22k1%22')).status).toBe(400)
    await fixture.pg.exec('create index events_kind_idx on events (kind); analyze events')
    expect((await list(app, 'filter=kind%20%3D%20%22k2%22')).status).toBe(400)
    expect((await list(createTestApp(fixture), 'filter=kind%20%3D%20%22k2%22')).status).toBe(200)
    await fixture.pg.exec('drop index events_kind_idx')
  })

  it('rejects an unindexed sort the same way', async () => {
    const response = await list(createTestApp(fixture), 'order_by=at%20desc&page_size=5')
    expect(response.status).toBe(400)
    expect((await response.json()).suggestion).toBe('create index on "events" ("at")')
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

  it('does nothing when off, and honors the row threshold', async () => {
    expect((await list(createTestApp(fixture, { scanGuard: { mode: 'off' } }), 'filter=kind%20%3D%20%22k1%22&page_size=2')).status).toBe(200)
    expect((await list(createTestApp(fixture, { scanGuard: { seqScanRows: 1_000_000 } }), 'filter=kind%20%3D%20%22k1%22&page_size=2')).status).toBe(200)
  })
})
