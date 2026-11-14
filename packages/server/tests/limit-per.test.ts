import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { defineRoles, f, resource } from '@protobase/schema'
import { createAdmin } from '@protobase/server'
import { openSnapshotDb, type SnapshotDb } from '../../../test-support/sql-snapshot'
import { signTestToken, testAuthenticator } from '../../../test-support/server'

// `limit_per=<field>:<n>` on a list and on `:aggregate`, replayed from real Postgres: the first n rows per value of a
// field, in the read's own order, under the caller's tenant and access.

const organizations = resource('organizations').table('organizations').fields({ id: f.integer().readOnly().filterable() }).primaryKey((r) => r.id)

const tasks = resource('tasks')
  .table('tasks')
  .fields({ id: f.integer().readOnly().filterable().sortable(), org: f.relation('organizations').filterable(), state: f.text().filterable() })
  .primaryKey((r) => r.id)
  .tenant((r) => r.org)

const comments = resource('comments')
  .table('comments')
  .fields({
    id: f.integer().readOnly().filterable().sortable(),
    org: f.relation('organizations').filterable(),
    task_id: f.relation('tasks').filterable(),
    author_id: f.integer().filterable(),
    kind: f.text().filterable(),
    hidden: f.boolean().filterable(),
    created_at: f.timestamp().sortable(),
    position: f.integer().sortable(),
  })
  .primaryKey((r) => r.id)
  .tenant((r) => r.org)

const roles = defineRoles<'organizations' | 'tasks' | 'comments'>({
  admin: ['*'],
  member: ['organizations.read', 'tasks.read', { 'comments.read': { filter: 'hidden = false' } }],
})

const as = (org: number, role: string) => ({ authorization: `Bearer ${signTestToken({ roles: [role], tenant: org })}` })
const admin = as(1, 'admin')
const member = as(1, 'member')

describe('limit_per', () => {
  let database: SnapshotDb
  let app: ReturnType<typeof createAdmin>

  beforeAll(async () => {
    database = await openSnapshotDb('empty')
    await database.exec(`
      create table organizations (id integer primary key);
      create table tasks (id integer primary key, org integer not null references organizations, state text not null);
      create index on tasks (state);
      create table comments (id integer primary key, org integer not null references organizations, task_id integer references tasks,
        author_id integer not null, kind text not null, hidden boolean not null, created_at timestamptz not null, position integer not null);
      create index on comments (task_id, created_at);
      create index on comments (task_id);
      create index on comments (kind);
      create index on comments (hidden);
      create index on comments (org, created_at);
      insert into organizations values (1), (2);
      insert into tasks values (1, 1, 'open'), (2, 1, 'open'), (3, 1, 'open'), (4, 1, 'done'), (5, 2, 'open');
      insert into comments values
        (1, 1, 1, 7, 'note', false, '2026-01-01', 1), (2, 1, 1, 7, 'note', false, '2026-01-02', 2),
        (3, 1, 1, 8, 'question', false, '2026-01-03', 3), (4, 1, 1, 8, 'note', false, '2026-01-04', 4),
        (5, 1, 1, 9, 'note', true, '2026-01-05', 5), (6, 1, 2, 7, 'question', false, '2026-01-02', 1),
        (7, 1, 4, 7, 'note', false, '2026-01-06', 1), (8, 1, 4, 7, 'note', false, '2026-01-07', 2),
        (9, 1, null, 7, 'note', false, '2026-01-08', 1), (10, 2, 5, 7, 'note', false, '2026-01-09', 1);`)
    app = createAdmin({ resources: [organizations, tasks, comments], db: database.db, authenticate: testAuthenticator, options: { roles } })
  })
  afterAll(async () => { await database?.close() })

  const read = (path: string, headers: Record<string, string>) => app.request(`/api/v1${path}`, { headers })
  const items = async (path: string, headers: Record<string, string>) => {
    const response = await read(path, headers)
    expect(response.status, JSON.stringify(await response.clone().json())).toBe(200)
    return (await response.json()) as { items: Array<{ id: number; task_id: number | null }>; next_page_token: string }
  }
  const problem = async (path: string, headers: Record<string, string>) => {
    const response = await read(path, headers)
    expect(response.status).toBe(400)
    return response.json()
  }
  const newest = (filter = '') => `/comments?limit_per=task_id:2&order_by=${encodeURIComponent('created_at desc')}${filter && `&filter=${encodeURIComponent(filter)}`}`

  it('keeps the first n rows per value in the read\'s order, by value, with no further page', async () => {
    const page = await items(newest(), admin)
    expect(page.items.map((item) => [item.task_id, item.id])).toEqual([[1, 5], [1, 4], [2, 6], [4, 8], [4, 7]])
    expect(page.next_page_token).toBe('')
    const narrowed = (await items(`${newest()}&fields=id`, admin)).items
    expect(narrowed.map((item) => [item.id, item.task_id])).toEqual([[5, undefined], [4, undefined], [6, undefined], [8, undefined], [7, undefined]])
  })

  it("reads under the caller's access and tenant, and caps all rows at the page size", async () => {
    expect((await items(newest(), member)).items.map((item) => item.id)).toEqual([4, 3, 6, 8, 7])
    expect((await items(newest(), as(2, 'member'))).items.map((item) => item.id)).toEqual([10])
    expect((await items(`${newest()}&page_size=3`, admin)).items.map((item) => item.id)).toEqual([5, 4, 6])
  })

  it('keeps only the values the filter keeps, a related() term included', async () => {
    expect((await items(newest('related(task_id, tasks.id, (state = "open"))'), admin)).items.map((item) => item.id)).toEqual([5, 4, 6])
    expect((await items(newest('kind = "question"'), admin)).items.map((item) => item.id)).toEqual([3, 6])
  })

  it('keeps the first groups per value on :aggregate, each with its per value', async () => {
    const response = await read('/comments:aggregate?group_by=kind&limit_per=task_id:1', admin)
    expect(response.status, JSON.stringify(await response.clone().json())).toBe(200)
    expect((await response.json()).groups).toEqual([
      { per: 1, value: 'note', count: 4 },
      { per: 2, value: 'question', count: 1 },
      { per: 4, value: 'note', count: 2 },
    ])
  })

  it('refuses a page token, :seek and a date group_by, naming the conflict', async () => {
    const first = await items('/comments?order_by=id&page_size=1', admin)
    expect((await problem(`${newest()}&page_token=${first.next_page_token}`, admin)).detail).toBe('limit_per cannot be combined with page_token: a list that keeps the first rows per value has no further page')
    expect((await problem('/comments:seek?limit_per=task_id:2&position=0', admin)).detail).toContain('limit_per cannot be combined with :seek')
    expect((await problem('/comments:aggregate?group_by=created_at&limit_per=task_id:1', admin)).detail).toBe('Invalid parameter limit_per: Not for a date or timestamp group_by')
  })

  it('refuses an n that is no whole number from 1', async () => {
    for (const n of ['0', '-1', '1.5', 'x']) expect((await problem(`/comments?limit_per=task_id:${n}`, admin)).type).toBe('urn:protobase:problem:invalid-parameter')
  })

  it('refuses a field no index serves, or no index with the sort under it, and names the index', async () => {
    const unindexed = await problem('/comments?limit_per=author_id:2', admin)
    expect(unindexed.type).toBe('urn:protobase:problem:expensive-query')
    expect(unindexed.suggestion).toBe('create index on "comments" ("author_id")')
    const unsorted = await problem(`/comments?limit_per=task_id:2&order_by=position`, admin)
    expect(unsorted.suggestion).toBe('create index on "comments" ("task_id", "position")')
    expect(unsorted.detail).toContain('Keeping the first rows per value of "task_id"')
  })
})
