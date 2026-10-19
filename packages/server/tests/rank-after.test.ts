import { Kysely } from 'kysely'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { createAdmin } from '../src/create-admin'
import { as, testAuthenticator } from '../../../test-support/server'
import { openSnapshotDb, type SnapshotDb } from '../../../test-support/sql-snapshot'

// A task never ranks above an open task it is blocked by
const tasks = resource('tasks')
  .table('tasks')
  .fields({ id: f.integer().readOnly().filterable().sortable().dbDefault(), title: f.text(), status: f.text().filterable(), position: f.integer().sortable() })
  .primaryKey((r) => r.id)
  .position((r) => r.position, { after: { resource: 'task_dependencies', field: 'task_id', key: 'depends_on_id', filter: 'type = "blocked-by"', while: 'status != "done"' } })
const taskDependencies = resource('task_dependencies')
  .table('task_dependencies')
  .fields({ task_id: f.relation('tasks').filterable(), type: f.text().filterable(), depends_on_id: f.relation('tasks').filterable() })
  .primaryKey((r) => [r.task_id, r.type, r.depends_on_id])

let pg: SnapshotDb
let db: Kysely<any>
let app: ReturnType<typeof createAdmin>

beforeAll(async () => {
  pg = await openSnapshotDb('empty')
  await pg.exec(`
    create table tasks (id integer generated always as identity primary key, title text not null, status text not null, position integer not null);
    create table task_dependencies (task_id integer not null references tasks (id), type text not null, depends_on_id integer not null references tasks (id), primary key (task_id, type, depends_on_id));
  `)
  db = new Kysely({ dialect: pg.dialect })
  app = createAdmin({ resources: [tasks, taskDependencies], db, authenticate: testAuthenticator })
})
afterAll(async () => { await db.destroy() })

// d waits for b, and for c, which is done; d is a's parent, which orders nothing; a already ranks above b, which it waits for
beforeEach(async () => {
  await pg.exec(`truncate task_dependencies, tasks restart identity cascade;
    insert into tasks (title, status, position) values ('a', 'open', 1), ('b', 'open', 2), ('c', 'done', 3), ('d', 'open', 4);
    insert into task_dependencies values (4, 'blocked-by', 2), (4, 'blocked-by', 3), (4, 'parent', 1), (1, 'blocked-by', 2);`)
})

const reorder = async (keys: number[], start: number) => {
  const etags: Record<string, string> = {}
  for (const key of keys) etags[key] = (await app.request(`/api/v1/tasks/${key}`, { headers: as(undefined) })).headers.get('etag')!
  return app.request('/api/v1:batchWrite', {
    method: 'POST',
    headers: { ...as(undefined), 'content-type': 'application/json' },
    body: JSON.stringify({ ops: [{ op: 'reorder', resource: 'tasks', field: 'position', keys, start, etags }] }),
  })
}
const positions = async () => (await pg.query<{ title: string; position: number }>('select title, position from tasks order by id')).rows.map((row) => `${row.title}${row.position}`)

describe('reorder by a position with `after`', () => {
  it('refuses to rank a task above an open task it waits for, and writes nothing', async () => {
    const response = await reorder([4, 2], 2)
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ type: 'urn:protobase:problem:ranks-above-dependency', detail: 'tasks 4 cannot rank above 2, which it depends on', record: 4, dependsOn: 2 })
    expect(await positions()).toEqual(['a1', 'b2', 'c3', 'd4'])
  })

  it('refuses to rank a task below one that waits for it', async () => {
    expect((await reorder([2], 5)).status).toBe(409)
  })

  it('lets a task rank above a done one it waits for', async () => {
    const response = await reorder([4, 3], 3)
    expect(response.status, await response.clone().text()).toBe(200)
    expect(await positions()).toEqual(['a1', 'b2', 'c4', 'd3'])
  })

  it('keeps an order it did not break, and orders nothing by a parent', async () => {
    expect((await reorder([3, 1], 1)).status).toBe(200)
    expect((await reorder([1], 5)).status).toBe(200)
    expect(await positions()).toEqual(['a5', 'b2', 'c1', 'd4'])
  })
})

const update = (key: number, data: Record<string, unknown>) => app.request(`/api/v1/tasks/${key}`, {
  method: 'PATCH',
  headers: { ...as(undefined), 'content-type': 'application/json', 'if-match': '*' },
  body: JSON.stringify(data),
})
const batch = (ops: unknown[]) => app.request('/api/v1:batchWrite', {
  method: 'POST',
  headers: { ...as(undefined), 'content-type': 'application/json' },
  body: JSON.stringify({ ops }),
})

describe('create and update of a position with `after`', () => {
  it('refuses an update that ranks a task above an open task it waits for, and writes nothing', async () => {
    const response = await update(4, { position: 1 })
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ type: 'urn:protobase:problem:ranks-above-dependency', record: 4, dependsOn: 2 })
    expect(await positions()).toEqual(['a1', 'b2', 'c3', 'd4'])
  })

  it('refuses an update that ranks a task below one that waits for it', async () => {
    expect((await update(2, { position: 5 })).status).toBe(409)
  })

  it('keeps an order it did not break, and checks nothing when the position is not written', async () => {
    expect((await update(1, { position: 0 })).status).toBe(200)
    expect((await update(4, { title: 'd!' })).status).toBe(200)
    expect(await positions()).toEqual(['a0', 'b2', 'c3', 'd!4'])
  })

  it('refuses the batch update op the same way', async () => {
    const response = await batch([{ op: 'update', resource: 'tasks', key: 4, data: { position: 0 }, etag: '*' }])
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ type: 'urn:protobase:problem:ranks-above-dependency', operation: 0, record: 4, dependsOn: 2 })
  })

  it('lets a batch create a task at any rank, as nothing depends on it yet', async () => {
    const response = await batch([{ op: 'create', resource: 'tasks', data: { title: 'e', status: 'open', position: 0 } }])
    expect(response.status, await response.clone().text()).toBe(200)
  })
})
