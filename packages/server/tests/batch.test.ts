import { PGlite } from '@electric-sql/pglite'
import { Kysely } from 'kysely'
import { PGliteDialect } from 'kysely-pglite-dialect'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { createAdmin } from '../src/create-admin'
import { as, testAuthenticator } from '../../../test-support/server'
import type { WriteEvent } from '../src/types'
import { createEmptyPg } from '../../../test-support/pglite-snapshot'

const isAdmin = (ctx: { user?: { roles?: readonly string[] } }) => ctx.user?.roles?.includes('admin') ?? false

const folders = resource('folders')
  .table('folders')
  .fields({
    id: f.integer().readOnly().filterable().sortable().dbDefault(),
    organizationId: f.relation('organizations'),
    title: f.text(),
    updatedAt: f.timestamp().readOnly().dbDefault(),
  })
  .primaryKey((r) => r.id)
  .tenant((r) => r.organizationId)

const line = (name: string, table: string) =>
  resource(name)
    .table(table)
    .fields({
      id: f.integer().readOnly().filterable().sortable().dbDefault(),
      folderId: f.relation('folders').filterable(),
      organizationId: f.relation('organizations'),
      position: f.integer().sortable(),
      body: f.text(),
      updatedAt: f.timestamp().readOnly().dbDefault(),
    })
    .primaryKey((r) => r.id)
    .tenant((r) => r.organizationId)

const lines = line('lines', 'lines')
// position <= 3: the first temporary range (above the highest value) is refused, the negative one is not
const tightLines = line('tightLines', 'tight_lines')
const guarded = line('guarded', 'guarded').access({ update: isAdmin })

let pg: PGlite
let db: Kysely<any>
let events: WriteEvent[]
let app: ReturnType<typeof createAdmin>

beforeAll(async () => {
  pg = await createEmptyPg()
  const child = (table: string, extra = '') => `
    create table ${table} (id integer generated always as identity primary key, folder_id integer not null references folders (id), organization_id integer not null,
      position integer not null ${extra}, body text not null, updated_at timestamptz not null default now(), unique (folder_id, position));`
  await pg.exec(`
    create table folders (id integer generated always as identity primary key, organization_id integer not null, title text not null, updated_at timestamptz not null default now());
    ${child('lines')} ${child('tight_lines', 'check (position <= 3)')} ${child('guarded')}
  `)
  db = new Kysely({ dialect: new PGliteDialect(pg) })
  app = createAdmin({
    resources: [folders, lines, tightLines, guarded],
    db,
    authenticate: testAuthenticator,
    options: { writeHooks: [async (event) => { events.push(event) }] },
  })
})
afterAll(async () => { await db.destroy() })

beforeEach(async () => {
  events = []
  await pg.exec(`truncate guarded, tight_lines, lines, folders restart identity cascade;
    insert into folders (organization_id, title) values (1, 'doc one');
    insert into lines (folder_id, organization_id, position, body) values (1, 1, 1, 'a'), (1, 1, 2, 'b'), (1, 1, 3, 'c');
    insert into tight_lines (folder_id, organization_id, position, body) values (1, 1, 1, 'a'), (1, 1, 2, 'b'), (1, 1, 3, 'c');
    insert into guarded (folder_id, organization_id, position, body) values (1, 1, 1, 'a');`)
})

const get = async (path: string, roles = 'admin') => app.request(`/api/v1${path}`, { headers: as(1, roles) })
const batch = (operations: unknown[], roles = 'admin', org: number | undefined = 1) =>
  app.request('/api/v1:batchWrite', { method: 'POST', headers: { ...as(org, roles), 'content-type': 'application/json' }, body: JSON.stringify({ ops: operations }) })
const etagOf = async (path: string) => (await get(path)).headers.get('etag')!
const positions = async (table = 'lines') => (await pg.query<{ body: string; position: number }>(`select body, position from ${table} order by id`)).rows.map((row) => `${row.body}${row.position}`)

describe('POST /api/v1:batchWrite', () => {
  it('updates a parent and its lines and swaps positions under a real unique index, in one transaction', async () => {
    const [doc, one, two, three] = await Promise.all([etagOf('/folders/1'), etagOf('/lines/1'), etagOf('/lines/2'), etagOf('/lines/3')])
    const response = await batch([
      { op: 'update', resource: 'folders', key: 1, etag: doc, data: { title: 'renamed' } },
      { op: 'update', resource: 'lines', key: 3, etag: three, data: { body: 'c2' } },
      { op: 'reorder', resource: 'lines', field: 'position', keys: [2, 1, 3], etags: { 1: one, 2: two, 3: three } },
    ])
    const body = await response.json()
    expect(response.status, JSON.stringify(body)).toBe(200)
    expect(body.results.map((result: { op: string }) => result.op)).toEqual(['update', 'update', 'reorder'])
    expect(body.results[0]).toMatchObject({ resource: 'folders', record: { title: 'renamed' }, etag: expect.any(String) })
    expect(body.results[2].records.map((r: { record: { id: number; position: number } }) => [r.record.id, r.record.position])).toEqual([[2, 1], [1, 2], [3, 3]])
    expect(await positions()).toEqual(['a2', 'b1', 'c23'])
    expect((await pg.query<{ title: string }>('select title from folders')).rows[0]!.title).toBe('renamed')
  })

  it('writes only the rows whose position changes, each as an ordinary update with hooks', async () => {
    const [one, two, three] = await Promise.all([etagOf('/lines/1'), etagOf('/lines/2'), etagOf('/lines/3')])
    const response = await batch([{ op: 'reorder', resource: 'lines', field: 'position', keys: [2, 1, 3], etags: { 1: one, 2: two, 3: three } }])
    expect(response.status).toBe(200)
    expect(events.map((event) => [event.operation, (event.before as { id: number }).id, (event.before as { position: number }).position, (event.after as { position: number }).position])).toEqual([
      ['update', 2, 2, 1],
      ['update', 1, 1, 2],
    ])
    const results = (await response.json()).results[0].records
    expect(results[2].etag).toBe(three)
  })

  it('moves rows aside below the range when a check constraint refuses values above it', async () => {
    const etags = Object.fromEntries(await Promise.all([1, 2, 3].map(async (id) => [id, await etagOf(`/tightLines/${id}`)])))
    const response = await batch([{ op: 'reorder', resource: 'tightLines', field: 'position', keys: [3, 2, 1], etags }])
    expect(response.status, await response.clone().text()).toBe(200)
    expect(await positions('tight_lines')).toEqual(['a3', 'b2', 'c1'])
  })

  it('requires the ETag of each record that moves, and a stale one fails the batch with 412 and writes nothing', async () => {
    const [one, two, three] = await Promise.all([etagOf('/lines/1'), etagOf('/lines/2'), etagOf('/lines/3')])
    const missing = await batch([{ op: 'reorder', resource: 'lines', field: 'position', keys: [2, 1, 3], etags: { 1: one } }])
    expect(missing.status).toBe(428)
    await pg.exec("update lines set body = 'changed elsewhere', updated_at = clock_timestamp() where id = 2")
    const doc = await etagOf('/folders/1')
    const stale = await batch([
      { op: 'update', resource: 'folders', key: 1, etag: doc, data: { title: 'must not stick' } },
      { op: 'reorder', resource: 'lines', field: 'position', keys: [2, 1, 3], etags: { 1: one, 2: two, 3: three } },
    ])
    const problem = await stale.json()
    expect(stale.status).toBe(412)
    expect(stale.headers.get('content-type')).toContain('application/problem+json')
    expect(problem).toMatchObject({ operation: 1, op: 'reorder', resource: 'lines', type: 'urn:protobase:problem:precondition-failed' })
    expect((await pg.query<{ title: string }>('select title from folders')).rows[0]!.title).toBe('doc one')
    expect(await positions()).toEqual(['a1', 'changed elsewhere2', 'c3'])
  })

  it('rolls everything back when a middle operation fails, and names it', async () => {
    const response = await batch([
      { op: 'create', resource: 'folders', data: { title: 'new doc' } },
      { op: 'update', resource: 'lines', key: 1, etag: '*', data: { body: 'changed' } },
      { op: 'update', resource: 'lines', key: 2, etag: '*', data: { nope: 1 } },
      { op: 'delete', resource: 'lines', key: 3 },
    ])
    const problem = await response.json()
    expect(response.status).toBe(400)
    expect(problem).toMatchObject({ operation: 2, op: 'update', resource: 'lines', type: 'urn:protobase:problem:invalid-record' })
    expect((await pg.query('select 1 from folders where title = \'new doc\'')).rows).toHaveLength(0)
    expect(await positions()).toEqual(['a1', 'b2', 'c3'])
  })

  it('creates a parent and children through $ref, in the key and data positions', async () => {
    const response = await batch([
      { op: 'create', resource: 'folders', ref: 'doc', data: { title: 'fresh' } },
      { op: 'create', resource: 'lines', data: { folderId: { $ref: 'doc' }, position: 1, body: 'first' } },
      { op: 'create', resource: 'lines', ref: 'second', data: { folderId: { $ref: 'doc' }, position: 2, body: 'second' } },
      { op: 'update', resource: 'lines', key: { $ref: 'second' }, etag: '*', data: { body: 'second, edited' } },
      { op: 'delete', resource: 'lines', key: [{ $ref: 'second' }] },
    ])
    const body = await response.json()
    expect(response.status, JSON.stringify(body)).toBe(200)
    expect(body.results[0]).toMatchObject({ op: 'create', ref: 'doc', record: { title: 'fresh' } })
    const rows = (await pg.query<{ folder_id: number; body: string }>("select folder_id, body from lines where body in ('first', 'second, edited', 'second')")).rows
    expect(rows).toEqual([{ folder_id: body.results[0].record.id, body: 'first' }])
  })

  it('refuses unknown refs, repeated refs and unknown resources, naming the operation', async () => {
    const unknown = await batch([{ op: 'update', resource: 'lines', key: { $ref: 'nope' }, etag: '*', data: {} }])
    expect(unknown.status).toBe(400)
    expect(await unknown.json()).toMatchObject({ operation: 0, type: 'urn:protobase:problem:unknown-ref' })
    expect((await batch([{ op: 'create', resource: 'folders', ref: 'a', data: { title: 'x' } }, { op: 'create', resource: 'folders', ref: 'a', data: { title: 'y' } }])).status).toBe(400)
    const resource = await batch([{ op: 'create', resource: 'folders', data: { title: 'x' } }, { op: 'delete', resource: 'ghosts', key: 1 }])
    expect(resource.status).toBe(404)
    expect((await resource.json()).operation).toBe(1)
    expect((await pg.query("select 1 from folders where title = 'x'")).rows).toHaveLength(0)
  })

  it('checks access per operation and rolls the batch back when one is denied', async () => {
    const response = await batch([
      { op: 'create', resource: 'folders', data: { title: 'viewer made' } },
      { op: 'update', resource: 'guarded', key: 1, etag: '*', data: { body: 'x' } },
    ], 'viewer')
    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ operation: 1, resource: 'guarded', type: 'urn:protobase:problem:access-denied' })
    expect((await pg.query("select 1 from folders where title = 'viewer made'")).rows).toHaveLength(0)
    expect((await batch([{ op: 'update', resource: 'guarded', key: 1, etag: '*', data: { body: 'x' } }], 'admin')).status).toBe(200)
  })

  it('needs a token, keeps to 500 operations, and rejects malformed bodies', async () => {
    expect((await app.request('/api/v1:batchWrite', { method: 'POST', body: '{}' })).status).toBe(401)
    const many = Array.from({ length: 501 }, () => ({ op: 'delete', resource: 'lines', key: 1 }))
    expect((await batch(many)).status).toBe(400)
    expect((await batch([])).status).toBe(400)
    expect((await batch([{ op: 'explode' }])).status).toBe(400)
    const oneHundred = Array.from({ length: 500 }, (_, i) => ({ op: 'create', resource: 'folders', data: { title: `bulk ${i}` } }))
    expect((await batch(oneHundred)).status).toBe(200)
  })

  it('accepts the body as `operations` too', async () => {
    const response = await app.request('/api/v1:batchWrite', { method: 'POST', headers: { ...as(1), 'content-type': 'application/json' }, body: JSON.stringify({ operations: [{ op: 'create', resource: 'folders', data: { title: 'alias' } }] }) })
    expect(response.status).toBe(200)
  })

  it('answers 428 to an update without an ETag, like the single update does', async () => {
    const response = await batch([{ op: 'update', resource: 'lines', key: 1, data: { body: 'x' } }])
    expect(response.status).toBe(428)
  })
})
