import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { defineRoles, f, resource, type AccessContext } from '@protobase/schema'
import { createAdmin } from '@protobase/server'
import { openPostgresDatabase, postgresTemplateReady, type PostgresDatabase } from '../../../test-support/postgres-database'
import { signTestToken, testAuthenticator } from '../../../test-support/server'

// A list under a record, `/objectives/40/tasks`, on real Postgres: a declared link rewrites the path to related(), and
// the parent is read as the caller would read it, so one that is missing and one hidden from them answer alike.

const objectives = resource('objectives')
  .table('objectives')
  .fields({ id: f.integer().readOnly().filterable(), org: f.integer().filterable(), name: f.text().filterable(), state: f.text().filterable(), deleted_at: f.timestamp().optional().readOnly() })
  .primaryKey((r) => r.id)
  .tenant((r) => r.org)
  .softDelete((r) => r.deleted_at)

const tasks = resource('tasks')
  .table('tasks')
  .fields({ id: f.integer().readOnly().filterable().sortable(), org: f.integer().filterable(), title: f.text().filterable().sortable(), parent_id: f.relation('tasks').optional().filterable() })
  .primaryKey((r) => r.id)
  .tenant((r) => r.org)

const links = resource('objective_tasks')
  .table('objective_tasks')
  .fields({ objective_id: f.relation('objectives').filterable(), task_id: f.relation('tasks').filterable(), org: f.integer().filterable() })
  .primaryKey((r) => [r.objective_id, r.task_id])
  .tenant((r) => r.org)
  .links((r) => [r.objective_id, r.task_id])

const claims = resource('task_claims')
  .table('task_claims')
  .fields({ id: f.integer().readOnly().filterable().sortable(), task_id: f.relation('tasks').filterable(), org: f.integer().filterable(), who: f.text().filterable() })
  .primaryKey((r) => r.id)
  .tenant((r) => r.org)

const dependencies = resource('task_dependencies')
  .table('task_dependencies')
  .fields({ id: f.integer().readOnly().filterable().sortable(), task_id: f.relation('tasks').filterable(), depends_on_id: f.relation('tasks').filterable(), org: f.integer().filterable() })
  .primaryKey((r) => r.id)
  .tenant((r) => r.org)

const owned = resource('owned')
  .table('owned')
  .fields({ id: f.integer().readOnly().filterable(), owner: f.text().filterable() })
  .primaryKey((r) => r.id)
  .access({ read: ({ record, user }: AccessContext) => (record as { owner?: unknown } | undefined)?.owner === user?.id })
const ownedNotes = resource('owned_notes').table('owned_notes').fields({ id: f.integer().readOnly().filterable(), owned_id: f.relation('owned').filterable() }).primaryKey((r) => r.id)

const roles = defineRoles<'objectives' | 'tasks' | 'objective_tasks' | 'task_claims' | 'task_dependencies' | 'owned' | 'owned_notes'>({
  admin: ['*'],
  member: [{ 'objectives.read': { filter: 'state != "secret"' } }, 'tasks.read', 'objective_tasks.read', 'task_claims.read', 'task_dependencies.read', 'owned.read', 'owned_notes.read'],
  nolinks: ['objectives.read', 'tasks.read', 'task_claims.read'],
  writer: ['objectives.create', 'tasks.read'],
})

const as = (org: number, role: string) => ({ authorization: `Bearer ${signTestToken({ roles: [role], tenant: org })}` })
const member = as(1, 'member')

describe.skipIf(!(await postgresTemplateReady('empty')))('a list under a record', () => {
  let database: PostgresDatabase
  let app: ReturnType<typeof createAdmin>

  beforeAll(async () => {
    database = await openPostgresDatabase('empty')
    await database.exec(`
      create table objectives (id integer primary key, org integer not null, name text not null, state text not null, deleted_at timestamptz);
      create index on objectives (org);
      create index on objectives (state);
      create table tasks (id integer primary key, org integer not null, title text not null, parent_id integer references tasks);
      create index on tasks (org, id);
      create index on tasks (org, title);
      create index on tasks (parent_id);
      create table objective_tasks (objective_id integer not null references objectives, task_id integer not null references tasks, org integer not null, primary key (objective_id, task_id));
      create index on objective_tasks (task_id, objective_id);
      create index on objective_tasks (org);
      create table task_claims (id integer primary key, task_id integer not null references tasks, org integer not null, who text not null);
      create index on task_claims (task_id);
      create index on task_claims (org, id);
      create index on task_claims (who);
      create table task_dependencies (id integer primary key, task_id integer not null references tasks, depends_on_id integer not null references tasks, org integer not null);
      create index on task_dependencies (task_id);
      create index on task_dependencies (depends_on_id);
      create index on task_dependencies (org, id);
      create table owned (id integer primary key, owner text not null);
      create table owned_notes (id integer primary key, owned_id integer not null references owned);
      create index on owned_notes (owned_id);
      insert into objectives values (40, 1, 'open', 'open', null), (41, 1, 'hidden', 'secret', null), (42, 1, 'gone', 'open', now()), (50, 2, 'theirs', 'open', null);
      insert into tasks values (1, 1, 'first', null), (2, 1, 'second', 1), (3, 1, 'outside', null), (9, 2, 'other tenant', null);
      insert into objective_tasks values (40, 1, 1), (40, 2, 1), (41, 3, 1), (42, 3, 1), (50, 9, 2);
      insert into task_claims values (1, 1, 1, 'ann'), (2, 2, 1, 'bob'), (3, 3, 1, 'ann');
      insert into task_dependencies values (1, 1, 2, 1);
      insert into owned values (1, 'tester'), (2, 'someone else');
      insert into owned_notes values (1, 1), (2, 2);`)
    app = createAdmin({ resources: [objectives, tasks, links, claims, dependencies, owned, ownedNotes], db: database.db, authenticate: testAuthenticator, options: { roles } })
  })
  afterAll(async () => { await database?.close() })

  const get = (path: string, headers: Record<string, string> = member) => app.request(`/api/v1${path}`, { headers })
  const ids = async (path: string, headers = member) => {
    const response = await get(path, headers)
    expect(response.status).toBe(200)
    return ((await response.json()).items as Array<{ id: number }>).map((item) => item.id).sort()
  }

  it('lists what a declared link joins, on both sides', async () => {
    expect(await ids('/objectives/40/tasks')).toEqual([1, 2])
    expect((await (await get('/tasks/1/objectives')).json()).items.map((item: { id: number }) => item.id)).toEqual([40])
  })

  it('reaches a resource a further step away', async () => {
    expect(await ids('/objectives/40/task_claims')).toEqual([1, 2])
  })

  it('lists by a relation to the parent, without a declaration', async () => {
    expect(await ids('/tasks/1/task_claims')).toEqual([1])
    expect(await ids('/tasks/1/tasks')).toEqual([2])
    expect(await ids('/owned/1/owned_notes')).toEqual([1])
  })

  it('takes the caller\'s filter beside it, which cannot widen it', async () => {
    expect(await ids(`/objectives/40/task_claims?filter=${encodeURIComponent('who = "ann"')}`)).toEqual([1])
    expect(await ids(`/objectives/40/tasks?filter=${encodeURIComponent('title = "first" OR title = "outside"')}`)).toEqual([1])
    const escaped = await get(`/objectives/40/tasks?filter=${encodeURIComponent('title = "first") OR (title = "outside"')}`)
    expect(escaped.status).toBe(400)
  })

  it('works for every list method', async () => {
    const search = await app.request('/api/v1/objectives/40/tasks:search', { method: 'POST', headers: { ...member, 'content-type': 'application/json' }, body: JSON.stringify({ filter: 'title = "first"' }) })
    expect((await search.json()).items.map((item: { id: number }) => item.id)).toEqual([1])
    expect((await (await get('/objectives/40/task_claims:facets?field=who')).json()).facets).toEqual(expect.arrayContaining([{ value: 'ann', count: 1 }, { value: 'bob', count: 1 }]))
    expect((await get('/objectives/40/tasks:nothing')).status).toBe(404)
    for (const body of ['null', '[]', '{"filter":5}']) {
      const refused = await app.request('/api/v1/objectives/40/tasks:search', { method: 'POST', headers: { ...member, 'content-type': 'application/json' }, body })
      expect(refused.status).toBe(400)
    }
  })

  it('17: a parent elsewhere, soft-deleted or row-filtered out answers as one that does not exist', async () => {
    const missing = await get('/objectives/999/tasks')
    const body = await missing.json()
    expect(missing.status).toBe(404)
    for (const key of [50, 42, 41]) {
      const answer = await get(`/objectives/${key}/tasks`)
      expect(answer.status).toBe(404)
      expect({ ...(await answer.json()), instance: body.instance }).toEqual(body)
    }
  })

  it('17: a rule that reads the record hides a parent the same way', async () => {
    expect(await ids('/owned/1/owned_notes')).toEqual([1])
    const hidden = await (await get('/owned/2/owned_notes')).json()
    const missing = await (await get('/owned/999/owned_notes')).json()
    expect({ ...hidden, instance: missing.instance }).toEqual(missing)
  })

  it('a caller who cannot read the parent resource is told nothing of it', async () => {
    const writer = as(1, 'writer')
    expect((await get('/objectives/40/tasks', writer)).status).toBe(404)
    expect((await get('/objectives/999/tasks', writer)).status).toBe(404)
    expect((await (await get('/objectives/40/tasks', writer)).json()).detail).toBe((await (await get('/objectives/999/tasks', writer)).json()).detail)
  })

  it('refuses a list of a resource the caller cannot list as its own list does', async () => {
    expect((await get('/tasks/1/objective_tasks', as(1, 'nolinks'))).status).toBe((await get('/objective_tasks', as(1, 'nolinks'))).status)
  })

  it('goes through no link the caller cannot list, and names none', async () => {
    const none = as(1, 'nolinks')
    const answer = await get('/objectives/40/tasks', none)
    expect(answer.status).toBe(404)
    expect(JSON.stringify(await answer.json())).not.toContain('objective_tasks')
  })

  it('answers 404 where nothing leads, and 400 where two relations do', async () => {
    expect((await get('/objectives/40/owned_notes')).status).toBe(404)
    const ambiguous = await get('/objectives/40/task_dependencies')
    expect(ambiguous.status).toBe(400)
    expect((await ambiguous.json()).type).toBe('urn:protobase:problem:ambiguous-parent')
    expect((await get('/tasks/1/task_dependencies')).status).toBe(400)
  })

  it('counts and pages through the rewritten filter', async () => {
    const page = await (await get('/objectives/40/tasks?page_size=1&count=exact&order_by=id')).json()
    expect(page.total_size).toBe(2)
    expect((await get(`/objectives/40/tasks?page_size=1&order_by=id&page_token=${encodeURIComponent(page.next_page_token)}`)).status).toBe(200)
    expect((await get(`/objectives/41/tasks?page_size=1&order_by=id&page_token=${encodeURIComponent(page.next_page_token)}`, as(1, 'admin'))).status).toBe(400)
  })

  it('is in the OpenAPI document for those it leads to', async () => {
    const document = await (await app.request('/api/openapi.json', { headers: member })).json()
    expect(document.paths['/objectives/{key}/tasks'].get.operationId).toBe('list_tasks_of_objectives')
    expect(document.paths['/objectives/{key}/task_claims']).toBeDefined()
    expect(document.paths['/objectives/{key}/task_dependencies']).toBeUndefined()
    expect(document.paths['/objectives/{key}/owned_notes']).toBeUndefined()
  })
})
