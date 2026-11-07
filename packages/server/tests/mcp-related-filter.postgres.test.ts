import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { defineRoles, f, resource } from '@protobase/schema'
import { createUser } from '../src/better-auth/users'
import { openPostgresDatabase, postgresTemplateReady, type PostgresDatabase } from '../../../test-support/postgres-database'
import { password, serveMcp } from './support/mcp-app'

// `related()` through the app's MCP endpoint, as a person's AI client sends it: the same read as the REST API's, and the
// same refusal for a resource the caller's `/meta` does not hold.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

const objectives = resource('objectives').table('objectives').fields({ id: f.integer().readOnly().filterable() }).primaryKey((r) => r.id)
const tasks = resource('tasks').table('tasks').fields({ id: f.integer().readOnly().filterable().sortable(), title: f.text().filterable() }).primaryKey((r) => r.id)
const links = resource('objective_tasks')
  .table('objective_tasks')
  .fields({ objective_id: f.relation('objectives').filterable(), task_id: f.relation('tasks').filterable() })
  .primaryKey((r) => [r.objective_id, r.task_id])
  .links((r) => [r.objective_id, r.task_id])
const secrets = resource('secrets').table('secrets').fields({ id: f.integer().readOnly().filterable(), task_id: f.relation('tasks').filterable() }).primaryKey((r) => r.id)

const roles = defineRoles<'objectives' | 'tasks' | 'objective_tasks' | 'secrets'>({
  reader: ['objectives.read', 'tasks.read', 'objective_tasks.read'],
})

type Served = Awaited<ReturnType<typeof serveMcp>>
type ToolResult = { content: Array<{ text: string }> }

describe.skipIf(!(await postgresTemplateReady('auth')))('related() over MCP', () => {
  let database: PostgresDatabase
  let pool: pg.Pool
  let served: Served
  let token: string

  beforeAll(async () => {
    database = await openPostgresDatabase('auth')
    await database.exec(`
      create table objectives (id integer primary key);
      create table tasks (id integer primary key, title text not null);
      create index on tasks (title);
      create table objective_tasks (objective_id integer not null references objectives, task_id integer not null references tasks, primary key (objective_id, task_id));
      create index on objective_tasks (task_id);
      create table secrets (id integer primary key, task_id integer not null references tasks);
      create index on secrets (task_id);
      insert into objectives values (40), (41);
      insert into tasks values (1, 'in it'), (2, 'also in it'), (3, 'outside');
      insert into objective_tasks values (40, 1), (40, 2), (41, 3);
      insert into secrets values (1, 1);`)
    pool = database.pool({ max: 2 })
    const store = { dialect: database.dialect, query: async (text: string, params?: readonly unknown[]) => ({ rows: (await pool.query(text, params as unknown[])).rows }) }
    served = await serveMcp(undefined, { existing: store, db: database.db, resources: [objectives, tasks, links, secrets], auth: { roles: ['admin', 'reader'], defaultRole: 'reader' }, admin: { roles } })
    await createUser(served.auth, { email: 'root@example.com', password })
    await createUser(served.auth, { email: 'ana@example.com', password, role: 'reader' })
    token = (await served.grant('ana@example.com')).tokens.access_token
  })

  afterAll(async () => {
    await pool?.end()
    await database?.close()
  })

  const call = async (name: string, args: object) => {
    const response = await served.request('/api/mcp', {
      body: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } },
      headers: { host: 'localhost:5173', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-11-25', authorization: `Bearer ${token}` },
    })
    const text = await response.text()
    const data = text.trimStart().startsWith('{') ? text : text.split('\n').find((line) => line.startsWith('data: '))!.slice('data: '.length)
    const { result } = JSON.parse(data) as { result: ToolResult }
    return { content: JSON.parse(result.content[0]!.text) }
  }

  const filter = 'related(id, objective_tasks.task_id, (objective_id = 40))'

  it('narrows list_records and count_records', async () => {
    const page = await call('list_records', { resource: 'tasks', fields: ['id'], filter, order_by: 'id' })
    expect(page.content.items.map((item: { id: number }) => item.id)).toEqual([1, 2])
    expect((await call('count_records', { resource: 'tasks', filter })).content).toEqual({ count: 2 })
  })

  it('16: refuses a resource the caller does not read as one that does not exist', async () => {
    const hidden = await call('list_records', { resource: 'tasks', filter: 'related(id, secrets.task_id)' })
    const missing = await call('list_records', { resource: 'tasks', filter: 'related(id, nothing.task_id)' })
    expect(hidden.content.error).toBe('invalid-filter')
    expect(hidden.content.error).toBe(missing.content.error)
    expect(hidden.content.message.replace('secrets', 'X')).toBe(missing.content.message.replace('nothing', 'X'))
  })

  it('takes belongs_to beside filter', async () => {
    const belongs_to = { resource: 'objectives', key: 40 }
    const page = await call('list_records', { resource: 'tasks', fields: ['id'], belongs_to, filter: 'title = "in it"' })
    expect(page.content.items.map((item: { id: number }) => item.id)).toEqual([1])
    expect((await call('count_records', { resource: 'tasks', belongs_to })).content).toEqual({ count: 2 })
    expect((await call('count_records', { resource: 'objective_tasks', belongs_to, group_by: 'objective_id' })).content.groups[0].count).toBe(2)
  })

  it('refuses belongs_to as the route does, and never as no filter at all', async () => {
    expect((await call('list_records', { resource: 'tasks', belongs_to: { resource: 'objectives', key: 999 } })).content.error).toBe('not-found')
    expect((await call('list_records', { resource: 'tasks', belongs_to: { resource: 'secrets', key: 1 } })).content.error).toBe('not-found')
    expect((await call('list_records', { resource: 'tasks', belongs_to: { resource: 'objectives', key: [40, 41] } })).content.error).toBe('invalid-parameter')
  })

  it('names the relations that point at a resource, among those the caller reads', async () => {
    const { content } = await call('describe_resource', { resource: 'tasks' })
    expect(content.linked_from).toEqual([{ resource: 'objective_tasks', field: 'task_id' }])
  })
})
