import { sql } from 'kysely'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { createAdmin } from '../src/index'
import { as, testAuthenticator } from '../../../test-support/server'
import { openPostgresDatabase, postgresTemplateReady, type PostgresDatabase } from '../../../test-support/postgres-database'

// A move and an update of the hand-order field at the same moment. A gate before each update of a task (a BEFORE UPDATE
// trigger waiting on an advisory lock) holds the update after it has taken its locks, so the move starts while the
// update has not committed yet.

const gateLock = 7

const tasks = resource('tasks')
  .table('tasks')
  .fields({ id: f.integer().readOnly().filterable().sortable(), rank: f.integer().sortable(), title: f.text() })
  .primaryKey((r) => r.id)
  .position((r) => r.rank)

describe.skipIf(!(await postgresTemplateReady('empty')))('a move and a write of the order at the same moment, on Postgres', () => {
  let database: PostgresDatabase
  let app: ReturnType<typeof createAdmin>
  let other: pg.Client

  beforeAll(async () => {
    database = await openPostgresDatabase('empty')
    await database.exec(`
      create table tasks (id integer primary key, rank integer not null, title text not null);
      create index on tasks (rank);
      create function pass_gate() returns trigger language plpgsql as $$ begin perform pg_advisory_xact_lock_shared(${gateLock}); return new; end $$;
      create trigger pass_gate before update on tasks for each row execute function pass_gate();`)
    // The writes here wait on locks for as long as the test takes to see them waiting, which a busy machine stretches
    // past the API's default second.
    app = createAdmin({ resources: [tasks], db: database.db, authenticate: testAuthenticator, options: { statementTimeoutMs: 30_000 } })
  })
  afterAll(async () => { await database?.close() })

  beforeEach(async () => {
    await database.exec(`delete from tasks; insert into tasks (id, rank, title) values (1, 1, 'a'), (2, 2, 'b'), (3, 3, 'c'), (4, 4, 'd'), (5, 5, 'e');`)
    other = new pg.Client({ connectionString: database.url })
    await other.connect()
    return async () => { await other.end() }
  })

  const headers = { ...as(1, 'admin'), 'content-type': 'application/json', 'if-match': '*' }
  const send = (method: string, path: string, body: unknown) => app.request(`/api/v1${path}`, { method, headers, body: JSON.stringify(body) })
  // Until `count` statements of this database wait on a lock, a row's, the gate's or the order's
  const waiting = async (count: number) => {
    for (let tries = 0; tries < 200; tries++) {
      const { rows } = await sql<{ count: number }>`select count(*)::int as count from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'`.execute(database.db)
      if (rows[0]!.count >= count) return
      await new Promise((resolve) => setTimeout(resolve, 25))
    }
    throw new Error(`Fewer than ${count} statements waited on a lock`)
  }
  const order = async () => (await sql<{ title: string }>`select title from tasks order by rank`.execute(database.db)).rows.map((row) => row.title).join('')

  // Each takes a away from the top, so b no longer follows it
  for (const [what, write] of [
    ['an update', () => send('PATCH', '/tasks/1', { rank: 6 })],
    ['a batch update, as the undo of a move sends', () => send('POST', ':batchWrite', { ops: [{ op: 'update', resource: 'tasks', key: 1, etag: '*', data: { rank: 6 } }] })],
    ['a reorder', () => send('POST', ':batchWrite', { ops: [{ op: 'reorder', resource: 'tasks', field: 'rank', keys: [1], start: 6, etags: { 1: '*' } }] })],
  ] as const) {
    it(`refuses a move with 412 once ${what} that took the drop place away commits before it`, async () => {
      await other.query(`select pg_advisory_lock(${gateLock})`)
      const written = write()
      await waiting(1)
      const move = send('POST', ':batchWrite', { ops: [{ op: 'move', resource: 'tasks', field: 'rank', key: 5, after: 1, before: 2 }] })
      await waiting(2)
      await other.query(`select pg_advisory_unlock(${gateLock})`)
      expect([(await written).status, (await move).status]).toEqual([200, 412])
      expect(await order()).toBe('bcdea')
    })
  }
})
