import { Kysely } from 'kysely'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { f, resource } from '@protobase/schema'
import { createAdmin } from '../src/create-admin'
import { as, testAuthenticator } from '../../../test-support/server'
import { openSnapshotDb, type SnapshotDb } from '../../../test-support/sql-snapshot'

// A task waiting for a day stays parked: its trigger refuses queueing it by naming a check, as a CHECK constraint would
const tasks = resource('tasks')
  .table('tasks')
  .fields({
    id: f.integer().readOnly().filterable().sortable().dbDefault(),
    title: f.text(),
    lane: f.text(),
    waits: f.boolean(),
    estimate: f.integer(),
  })
  .primaryKey((r) => r.id)
  .checks({ tasks_parked_by_hand: { label: '{title} waits for a day, so it stays parked.' } })

let pg: SnapshotDb
let db: Kysely<any>
let app: ReturnType<typeof createAdmin>
const reported = vi.fn()

beforeAll(async () => {
  pg = await openSnapshotDb('empty')
  await pg.exec(`
    create table tasks (id integer generated always as identity primary key, title text not null, lane text not null, waits boolean not null,
      estimate integer not null constraint tasks_estimate_positive check (estimate > 0));
    create function tasks_lane() returns trigger language plpgsql as $$
    begin
      if new.waits and new.lane = 'queued' then
        raise exception 'Task % (%) is not parked by hand', new.id, new.title using errcode = 'check_violation', constraint = 'tasks_parked_by_hand';
      end if;
      if new.lane = 'broken' then
        raise exception 'Failed to process the row: %', new.title;
      end if;
      return new;
    end $$;
    create trigger tasks_lane before update on tasks for each row execute function tasks_lane();
  `)
  db = new Kysely({ dialect: pg.dialect })
  app = createAdmin({ resources: [tasks], db, authenticate: testAuthenticator, options: { onUnhandledError: reported } })
})
afterAll(async () => { await db.destroy() })

beforeEach(async () => {
  reported.mockClear()
  await pg.exec(`truncate tasks restart identity;
    insert into tasks (title, lane, waits, estimate) values ('Call the supplier', 'parked', true, 2);`)
})

const patch = (data: Record<string, unknown>) =>
  app.request('/api/v1/tasks/1', { method: 'PATCH', headers: { ...as(1), 'content-type': 'application/json', 'if-match': '*' }, body: JSON.stringify(data) })
const batch = (operations: unknown[]) =>
  app.request('/api/v1:batchWrite', { method: 'POST', headers: { ...as(1), 'content-type': 'application/json' }, body: JSON.stringify({ ops: operations }) })

describe('a database check the resource declares', () => {
  it('refuses the write a trigger raises it for with its name as the code and its label, nothing from the database', async () => {
    const response = await patch({ lane: 'queued' })
    const body = await response.json()
    expect(response.status).toBe(400)
    expect(body).toMatchObject({ type: 'urn:protobase:problem:invalid-record', errors: [{ field: '_record', code: 'tasks_parked_by_hand', message: '{title} waits for a day, so it stays parked.' }] })
    expect(JSON.stringify(body)).not.toContain('Call the supplier')
    expect(reported).not.toHaveBeenCalled()
  })

  it('names the operation of a batch it refuses', async () => {
    const response = await batch([{ op: 'update', resource: 'tasks', key: 1, etag: '*', data: { lane: 'queued' } }])
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ operation: 0, errors: [{ code: 'tasks_parked_by_hand' }] })
  })

  it('keeps the generic 400 for a CHECK constraint it does not declare, its name out of the answer', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const response = await patch({ estimate: 0 })
    const body = await response.json()
    expect(response.status).toBe(400)
    expect(body).toMatchObject({ detail: 'A check constraint rejected the record' })
    expect(JSON.stringify(body)).not.toContain('tasks_estimate_positive')
    expect(warn).toHaveBeenCalledWith('A database check the config does not declare refused a write: tasks_estimate_positive')
    warn.mockRestore()
  })

  it('keeps a plain raise a reported 500 that names nothing it raised', async () => {
    const response = await patch({ lane: 'broken' })
    expect(response.status).toBe(500)
    expect(await response.text()).not.toContain('Failed to process')
    expect(reported).toHaveBeenCalledOnce()
  })
})
