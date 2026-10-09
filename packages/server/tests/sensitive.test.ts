import { Kysely } from 'kysely'
import { PGliteDialect } from 'kysely-pglite-dialect'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { f, l, resource, view } from '@protobase/schema'
import type { AuditEvent, AuditQueue } from '../src/types'
import { consoleAuditQueue } from '../src/audit/console-queue'
import { createAdmin } from '../src/create-admin'
import { as, testAuthenticator } from '../../../test-support/server'
import { createEmptyPg } from '../../../test-support/pglite-snapshot'

const screener = (ctx: { user?: { roles?: readonly string[] } }) => ctx.user?.roles?.some((role) => role === 'admin' || role === 'screener') ?? false
const reader = (ctx: { user?: { roles?: readonly string[] } }) => !(ctx.user?.roles?.includes('outsider') ?? false)

const people = resource('people')
  .table('people')
  .fields({
    id: f.integer().readOnly().filterable().sortable(),
    organizationId: f.relation('organizations').filterable(),
    name: f.text().filterable().sortable(),
    iban: f.text().sensitive().access({ read: screener }),
    note: f.text().optional(),
    updatedAt: f.timestamp().readOnly(),
  })
  .primaryKey((r) => r.id)
  .tenant((r) => r.organizationId)
  .search((r) => [r.name])
  .access({ read: reader, list: reader })

const peopleView = view<typeof people>('people')
  .list((r) => ({ columns: [r.name, r.note] }))
  .layout((r) => [l.section('Person', [r.name, r.iban, r.note])])

const ibans = ['NL91ABNA0417164300', 'NL20INGB0001234567', 'DE89370400440532013000']
// Any IBAN-shaped text in a response is a leak
const leaked = (text: string) => /[A-Z]{2}\d{2}[A-Z0-9]{10,}/.test(text)

let db: Kysely<any>
const events: AuditEvent[] = []
const queue: AuditQueue = { publish: async (event) => void events.push(event) }
let app: ReturnType<typeof createAdmin>
beforeAll(async () => {
  const pg = await createEmptyPg()
  await pg.exec(`
    create table people (id integer generated always as identity primary key, organization_id integer not null, name text not null, iban text not null, note text, updated_at timestamptz not null default now());
    insert into people (organization_id, name, iban) values (1, 'Ada', '${ibans[0]}'), (1, 'Bert', '${ibans[1]}'), (2, 'Cleo', '${ibans[2]}');
  `)
  db = new Kysely({ dialect: new PGliteDialect(pg) })
  app = createAdmin({ resources: [people], views: [peopleView], db, authenticate: testAuthenticator, options: { audit: queue } })
})
afterAll(async () => { await db.destroy() })
beforeEach(() => { events.length = 0 })

const call = (path: string, init: RequestInit = {}, roles = 'admin', org = 1) =>
  app.request(path.startsWith('/api/') ? path : `/api/v1${path}`, { ...init, headers: { ...as(org, roles), 'content-type': 'application/json', ...(init.headers as Record<string, string>) } })
const post = (path: string, body: unknown, roles = 'admin', org = 1) => call(path, { method: 'POST', body: JSON.stringify(body) }, roles, org)
const reveal = (key: string | number, field = 'iban', roles = 'admin', org = 1) => post(`/people/${key}:reveal`, { field }, roles, org)

describe('a sensitive field', () => {
  it('is never sent by lists, searches, seeks or records', async () => {
    for (const path of ['/people', '/people?count=exact', '/people:seek?position=0', '/people/1']) {
      const response = await call(path)
      expect(response.status, path).toBe(200)
      expect(leaked(await response.text()), path).toBe(false)
    }
    const searched = await post('/people:search', { filter: 'search("Ada")' })
    expect(leaked(await searched.text())).toBe(false)
    const record = await (await call('/people/1')).json()
    expect(Object.keys(record)).not.toContain('iban')
    expect(record.permissions.fields.iban).toBe('edit')
  })

  it('cannot be selected, filtered, sorted, searched or counted', async () => {
    const refused = [
      '/people?fields=id,iban',
      `/people?filter=${encodeURIComponent(`iban = "${ibans[0]}"`)}`,
      '/people?order_by=iban',
      '/people:facets?field=iban',
      '/people/1?fields=iban',
    ]
    for (const path of refused) expect((await call(path)).status, path).toBe(400)
    const found = await (await post('/people:search', { filter: `search("${ibans[0]}")` })).json()
    expect(found.items).toEqual([])
  })

  it('is written like any other field but left out of write and batch responses', async () => {
    const created = await post('/people', { name: 'Dirk', iban: 'NL02RABO0123456789' })
    expect(created.status).toBe(201)
    const body = await created.text()
    expect(leaked(body)).toBe(false)
    const id = JSON.parse(body).id
    expect(await (await reveal(id)).json()).toEqual({ field: 'iban', value: 'NL02RABO0123456789' })

    const updated = await call(`/people/${id}`, { method: 'PATCH', headers: { 'if-match': '*' }, body: JSON.stringify({ iban: 'NL69INGB0123456789' }) })
    expect(updated.status).toBe(200)
    expect(leaked(await updated.text())).toBe(false)
    expect((await (await reveal(id)).json()).value).toBe('NL69INGB0123456789')

    const batch = await post('/api/v1:batchWrite', { ops: [
      { op: 'create', resource: 'people', ref: 'new', data: { name: 'Eva', iban: 'NL44RABO0123456789' } },
      { op: 'update', resource: 'people', key: id, etag: '*', data: { iban: 'NL18RABO0123456789', note: 'moved' } },
    ] })
    expect(batch.status).toBe(200)
    expect(leaked(await batch.text())).toBe(false)
  })

  it('stays in meta and the views, marked, and out of the documented record', async () => {
    const meta = await (await call('/api/meta')).json()
    const model = meta.resources.find((entry: { name: string }) => entry.name === 'people')
    expect(model.fields.iban.sensitive).toBe(true)
    expect(meta.views[0].layout[0].fields).toContain('iban')
    const document = await (await call('/api/openapi.json')).json()
    expect(Object.keys(document.components.schemas.People.properties)).not.toContain('iban')
    expect(Object.keys(document.components.schemas.PeopleCreate.properties)).toContain('iban')
    expect(document.paths['/people/{key}:reveal'].post.requestBody.content['application/json'].schema.properties.field.enum).toEqual(['iban'])
    const hidden = await (await call('/api/openapi.json', {}, 'viewer')).json()
    expect(hidden.paths['/people/{key}:reveal']).toBeUndefined()
  })
})

describe('POST /{resource}/{key}:reveal', () => {
  it('returns the value, uncached, and publishes exactly one event without it', async () => {
    const response = await reveal(1, 'iban', 'screener', 1)
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({ field: 'iban', value: ibans[0] })
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      type: 'field.revealed',
      actor: { id: 'tester', roles: ['screener'] },
      tenant: 1,
      resource: 'people',
      recordKey: '1',
      field: 'iban',
    })
    expect(Date.parse(events[0]!.at)).not.toBeNaN()
    expect(JSON.stringify(events[0])).not.toContain(ibans[0])
  })

  it('records the request origin from its headers', async () => {
    await call('/people/2:reveal', { method: 'POST', body: JSON.stringify({ field: 'iban' }), headers: { 'user-agent': 'test-agent', 'x-forwarded-for': '203.0.113.7' } })
    expect(events[0]!.origin).toEqual({ userAgent: 'test-agent', forwardedFor: '203.0.113.7' })
  })

  it('refuses records of another organization, unknown keys and callers who may not read the field or the record', async () => {
    expect((await reveal(3)).status).toBe(404)
    expect((await reveal(3, 'iban', 'admin', 2)).status).toBe(200)
    events.length = 0
    expect((await reveal(999)).status).toBe(404)
    expect((await reveal(1, 'iban', 'viewer')).status).toBe(400)
    // The outsider may still write people (no rule), so reading is forbidden rather than unknown
    expect((await reveal(1, 'iban', 'outsider')).status).toBe(403)
    expect(events).toEqual([])
  })

  it('refuses fields that are not sensitive or do not exist', async () => {
    expect((await reveal(1, 'name')).status).toBe(400)
    expect((await reveal(1, 'nothing')).status).toBe(400)
    expect((await post('/people/1:reveal', {})).status).toBe(400)
    expect(events).toEqual([])
  })

  it('reveals nothing when the event cannot be published', async () => {
    const failing = createAdmin({ resources: [people], db, authenticate: testAuthenticator, options: { audit: { publish: async () => { throw new Error('queue down') } }, onUnhandledError: () => {} } })
    const response = await failing.request('/api/v1/people/1:reveal', { method: 'POST', headers: { ...as(1), 'content-type': 'application/json' }, body: JSON.stringify({ field: 'iban' }) })
    expect(response.status).toBe(500)
    expect(leaked(await response.text())).toBe(false)
  })
})

describe('the console audit queue', () => {
  it('prints each event as one JSON line', async () => {
    const lines: string[] = []
    const event: AuditEvent = { type: 'field.revealed', at: '2026-10-09T10:00:00.000Z', actor: { id: 'u1', roles: ['manager'] }, tenant: 1, resource: 'tenants', recordKey: '7', field: 'iban', origin: {} }
    await consoleAuditQueue((line) => lines.push(line)).publish(event)
    expect(lines).toEqual([`[audit] ${JSON.stringify(event)}`])
  })

  it('is the default, printing every reveal to the console', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const plain = createAdmin({ resources: [people], db, authenticate: testAuthenticator })
    const response = await plain.request('/api/v1/people/1:reveal', { method: 'POST', headers: { ...as(1), 'content-type': 'application/json' }, body: JSON.stringify({ field: 'iban' }) })
    expect(response.status).toBe(200)
    expect(info).toHaveBeenCalledTimes(1)
    expect(String(info.mock.calls[0]![0])).toMatch(/^\[audit\] \{"type":"field.revealed"/)
    info.mockRestore()
  })
})

describe('the config', () => {
  it('refuses a sensitive field that could be found through the list API', () => {
    const table = (fields: Parameters<ReturnType<typeof resource>['fields']>[0]) => resource('things').table('things').fields(fields).primaryKey((r: any) => r.id)
    expect(() => table({ id: f.integer(), secret: f.text().sensitive().filterable() }).toModel()).toThrow('sensitive field "secret" cannot be filterable')
    expect(() => table({ id: f.integer(), secret: f.text().sensitive().sortable() }).toModel()).toThrow('cannot be sortable')
    expect(() => table({ id: f.integer(), secret: f.text().sensitive() }).search((r: any) => [r.secret]).toModel()).toThrow('cannot be searched')
  })

  it('refuses a view that lists a sensitive field', () => {
    const listed = view<typeof people>('people').list((r) => ({ columns: [r.name, r.iban] }))
    expect(() => createAdmin({ resources: [people], views: [listed], db, authenticate: testAuthenticator })).toThrow('sensitive field "iban" cannot be in a list column, sort or search')
    const sidebar = view<typeof people>('people').layout((r) => [l.sidebar([r.iban])])
    expect(() => createAdmin({ resources: [people], views: [sidebar], db, authenticate: testAuthenticator })).toThrow('cannot be in the sidebar')
    const result = view<typeof people>('people').searchResult((r) => ({ title: r.name, subtitle: r.iban }))
    expect(() => createAdmin({ resources: [people], views: [result], db, authenticate: testAuthenticator })).toThrow('sensitive field "iban" cannot be in the search result')
  })
})
