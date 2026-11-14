import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { defineRoles, f, resource } from '@protobase/schema'
import { createAdmin } from '@protobase/server'
import { openPostgresDatabase, postgresTemplateReady, type PostgresDatabase } from '../../../test-support/postgres-database'
import { signTestToken, testAuthenticator } from '../../../test-support/server'

// `related()` with its resource's order, limit and page token, and with a JSON list of keys on that side, on real
// Postgres: the children are those of exactly the records a list of the resource shows the caller on that page.

const organizations = resource('organizations').table('organizations').fields({ id: f.integer().readOnly().filterable() }).primaryKey((r) => r.id)

const tasks = resource('tasks')
  .table('tasks')
  .fields({
    id: f.integer().readOnly().filterable().sortable(),
    org: f.relation('organizations').filterable(),
    state: f.text().filterable(),
    created_at: f.timestamp().sortable(),
    rank: f.integer().sortable(),
    waits: f.json().optional().filterable(),
  })
  .primaryKey((r) => r.id)
  .tenant((r) => r.org)

const claims = resource('claims')
  .table('claims')
  .fields({ id: f.integer().readOnly().filterable().sortable(), org: f.relation('organizations').filterable(), task_id: f.relation('tasks').filterable(), claimed_at: f.timestamp().sortable() })
  .primaryKey((r) => r.id)
  .tenant((r) => r.org)

const steps = resource('steps')
  .table('steps')
  .fields({ id: f.integer().readOnly().filterable().sortable(), org: f.relation('organizations').filterable(), claim_id: f.relation('claims').filterable() })
  .primaryKey((r) => r.id)
  .tenant((r) => r.org)

const roles = defineRoles<'organizations' | 'tasks' | 'claims' | 'steps'>({
  admin: ['*'],
  member: ['organizations.read', { 'tasks.read': { filter: 'state != "secret"' } }, 'claims.read', 'steps.read'],
})

const as = (org: number, role: string) => ({ authorization: `Bearer ${signTestToken({ roles: [role], tenant: org })}` })
const admin = as(1, 'admin')
const member = as(1, 'member')

describe.skipIf(!(await postgresTemplateReady('empty')))("related() on a page of its resource's records", () => {
  let database: PostgresDatabase
  let app: ReturnType<typeof createAdmin>

  beforeAll(async () => {
    database = await openPostgresDatabase('empty')
    await database.exec(`
      create table organizations (id integer primary key);
      create table tasks (id integer primary key, org integer not null references organizations, state text not null, created_at timestamptz not null, rank integer not null, waits jsonb);
      create index on tasks (org, created_at);
      create index on tasks (state);
      create table claims (id integer primary key, org integer not null references organizations, task_id integer not null references tasks, claimed_at timestamptz not null);
      create index on claims (task_id);
      create index on claims (org, claimed_at);
      create table steps (id integer primary key, org integer not null references organizations, claim_id integer not null references claims);
      create index on steps (claim_id);
      create index on steps (org, id);
      insert into organizations values (1), (2);
      insert into tasks values
        (1, 1, 'open', '2026-01-01', 1, '[2, 3]'),
        (2, 1, 'open', '2026-01-02', 2, '[]'),
        (3, 1, 'secret', '2026-01-03', 3, '[1]'),
        (4, 1, 'open', '2026-01-04', 4, null),
        (5, 1, 'open', '2026-01-05', 5, '[4, "2", "x", 99999999999, {"a": 1}, null]'),
        (6, 2, 'open', '2026-02-01', 6, '[1]'),
        (7, 1, 'open', '2026-01-07', 7, '{"not": "a list"}');
      insert into claims values
        (1, 1, 1, '2026-01-10'), (2, 1, 2, '2026-01-11'), (3, 1, 3, '2026-01-12'), (4, 1, 4, '2026-01-13'),
        (5, 1, 5, '2026-01-14'), (6, 2, 6, '2026-01-14'), (7, 1, 7, '2026-01-15'), (8, 1, 5, '2026-01-16');
      insert into steps values (1, 1, 1), (2, 1, 5), (3, 1, 8), (4, 1, 7), (5, 1, 4);`)
    app = createAdmin({ resources: [organizations, tasks, claims, steps], db: database.db, authenticate: testAuthenticator, options: { roles } })
  })
  afterAll(async () => { await database?.close() })

  const read = (path: string, headers: Record<string, string>) => app.request(`/api/v1${path}`, { headers })
  const list = (name: string, filter: string, headers: Record<string, string>) => read(`/${name}?filter=${encodeURIComponent(filter)}&order_by=id`, headers)
  const ids = async (name: string, filter: string, headers: Record<string, string>) => {
    const response = await list(name, filter, headers)
    expect(response.status, JSON.stringify(await response.clone().json())).toBe(200)
    return ((await response.json()).items as Array<{ id: number }>).map((item) => item.id)
  }

  it('keeps to the newest parents its order and limit select', async () => {
    expect(await ids('claims', 'related(task_id, tasks.id, (state = "open"), "created_at desc", 2)', member)).toEqual([5, 7, 8])
    expect(await ids('claims', 'related(task_id, tasks.id, "created_at desc", 1)', member)).toEqual([7])
    expect(await ids('claims', 'related(task_id, tasks.id, (state = "open"))', member)).toEqual([1, 2, 4, 5, 7, 8])
  })

  it("reads the parents as the caller lists them: a row they cannot see takes no place on the page, another tenant's neither", async () => {
    expect(await ids('claims', 'related(task_id, tasks.id, "created_at asc", 3)', member)).toEqual([1, 2, 4])
    expect(await ids('claims', 'related(task_id, tasks.id, "created_at asc", 3)', admin)).toEqual([1, 2, 3])
    expect(await ids('claims', 'related(task_id, tasks.id, "created_at desc", 1)', as(2, 'member'))).toEqual([6])
  })

  it("follows the parents' next page token to exactly that page's children", async () => {
    const first = await read(`/tasks?filter=${encodeURIComponent('state = "open"')}&order_by=${encodeURIComponent('created_at desc')}&page_size=2`, member)
    const { items, next_page_token: token } = await first.json() as { items: Array<{ id: number }>; next_page_token: string }
    expect(items.map((item) => item.id)).toEqual([7, 5])
    const second = await read(`/tasks?filter=${encodeURIComponent('state = "open"')}&order_by=${encodeURIComponent('created_at desc')}&page_size=2&page_token=${token}`, member)
    expect(((await second.json()).items as Array<{ id: number }>).map((item) => item.id)).toEqual([4, 2])
    expect(await ids('claims', `related(task_id, tasks.id, (state = "open"), "created_at desc", 2, "${token}")`, member)).toEqual([2, 4])

    const elsewhere = await list('claims', `related(task_id, tasks.id, (state != "done"), "created_at desc", 2, "${token}")`, member)
    expect(elsewhere.status).toBe(400)
    expect((await elsewhere.json()).type).toBe('urn:protobase:problem:invalid-cursor')
  })

  it("matches the keys a JSON list of the parent holds, skipping what is no key, and an empty, null or other value's", async () => {
    expect(await ids('tasks', 'related(id, tasks.waits, (id = 1))', admin)).toEqual([2, 3])
    expect(await ids('tasks', 'related(id, tasks.waits, (id = 1))', member)).toEqual([2])
    expect(await ids('tasks', 'related(id, tasks.waits, (id = 5))', admin)).toEqual([2, 4])
    for (const parent of [2, 4, 7]) expect(await ids('tasks', `related(id, tasks.waits, (id = ${parent}))`, admin)).toEqual([])
    expect(await ids('tasks', 'related(id, tasks.waits, "created_at desc", 2)', member)).toEqual([2, 4])
  })

  it("reads no list of a parent the caller cannot see, nor another tenant's", async () => {
    expect(await ids('tasks', 'related(id, tasks.waits, (id = 3))', admin)).toEqual([1])
    expect(await ids('tasks', 'related(id, tasks.waits, (id = 3))', member)).toEqual([])
    expect(await ids('tasks', 'related(id, tasks.waits, (id = 6))', admin)).toEqual([])
  })

  it('refuses a key that is neither a JSON list nor a relation to the resource the field points at', async () => {
    const response = await list('claims', 'related(task_id, tasks.rank)', member)
    expect(response.status).toBe(400)
    expect((await response.json()).errors[0].code).toBe('unknown-field')
  })

  it('nests, each level on its own page', async () => {
    expect(await ids('steps', 'related(claim_id, claims.id, (related(task_id, tasks.id, "created_at desc", 2)), "claimed_at desc", 2)', member)).toEqual([3, 4])
  })

  it("refuses a parent sort no index serves, naming the index, as a list of the parent does", async () => {
    const response = await list('claims', 'related(task_id, tasks.id, "rank", 2)', member)
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.type).toBe('urn:protobase:problem:expensive-query')
    expect(body.suggestion).toBe('create index on "tasks" ("rank")')
    expect((await read(`/tasks?order_by=rank`, member)).status).toBe(400)
  })

  it('refuses an order of a field the parent does not have, at the term', async () => {
    const response = await list('claims', 'related(task_id, tasks.id, "nothing desc", 2)', member)
    expect(response.status).toBe(400)
    expect((await response.json()).type).toBe('urn:protobase:problem:invalid-filter')
  })
})
