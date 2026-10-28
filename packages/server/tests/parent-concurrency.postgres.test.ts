import { sql } from 'kysely'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { defineRoles, f, resource } from '@protobase/schema'
import { computedMigration, createAdmin, type PipelineHook } from '../src/index'
import { signTestToken, testAuthenticator } from '../../../test-support/server'
import { openPostgresDatabase, postgresTemplateReady, type PostgresDatabase } from '../../../test-support/postgres-database'

// Writes under one parent at the same moment, each of which also changes the parent: through a rollup, a write hook or
// a batch. A gate between the parent check and the insert (a BEFORE INSERT trigger waiting on an advisory lock) lets
// both writes take their parent lock before either changes the parent. A lock that both may hold at once, FOR SHARE,
// deadlocks there, which the raw SQL below shows on this very fixture; the parent lock the server takes must not.

const gateLock = 7

const roles = defineRoles<'vms' | 'operations' | 'vm_events' | 'vm_notes' | 'transfers' | 'folders'>({
  member: [
    'vms.read', 'vms.update.own', 'operations.read', 'operations.create', 'vm_events.read', 'vm_events.create',
    'vm_notes.read', 'vm_notes.create', 'transfers.read', 'transfers.create', 'folders.read', 'folders.update.own',
  ],
})

const vms = resource('vms')
  .table('vms')
  .fields({
    id: f.integer().readOnly(),
    owner_id: f.text().readOnly(),
    name: f.text(),
    operation_count: f.integer().rollup({ from: 'operations', via: 'vm_id', fn: 'count' }),
  })
  .primaryKey((r) => r.id)
  .owner((r) => r.owner_id)
const child = (name: string) =>
  resource(name).table(name).fields({ id: f.integer().readOnly(), vm_id: f.relation('vms') }).primaryKey((r) => r.id).parent((r) => r.vm_id, 'update')
// Operations count on their VM, an event renames its VM in a write hook, and a note changes nothing by itself
const operations = child('operations')
const vmEvents = child('vm_events')
const vmNotes = child('vm_notes')
const transfers = resource('transfers')
  .table('transfers')
  .fields({ id: f.integer().readOnly(), source_vm_id: f.relation('vms'), target_vm_id: f.relation('vms') })
  .primaryKey((r) => r.id)
  .parent((r) => r.source_vm_id, 'update')
  .parent((r) => r.target_vm_id, 'update')
const folders = resource('folders')
  .table('folders')
  .fields({ id: f.integer(), owner_id: f.text().readOnly(), parent_id: f.relation('folders').optional(), name: f.text() })
  .primaryKey((r) => r.id)
  .owner((r) => r.owner_id)
  .parent((r) => r.parent_id, 'update')

const renameOnEvent: PipelineHook = async (event, trx) => {
  if (event.resource.name !== 'vm_events' || event.operation !== 'create') return
  await sql`update vms set name = name || '+' where id = ${event.after!.vm_id}`.execute(trx)
}

describe.skipIf(!(await postgresTemplateReady('empty')))('writes under one parent at the same moment, on Postgres', () => {
  let database: PostgresDatabase
  let app: ReturnType<typeof createAdmin>
  let other: pg.Client

  beforeAll(async () => {
    database = await openPostgresDatabase('empty')
    await database.exec(`
      create table vms (id integer primary key, owner_id text, name text not null);
      create table operations (id integer generated always as identity primary key, vm_id integer not null references vms);
      create table vm_events (id integer generated always as identity primary key, vm_id integer not null references vms);
      create table vm_notes (id integer generated always as identity primary key, vm_id integer not null references vms);
      create table transfers (id integer generated always as identity primary key, source_vm_id integer not null references vms, target_vm_id integer not null references vms);
      create table folders (id integer primary key, owner_id text, parent_id integer references folders, name text not null);
      create function pass_gate() returns trigger language plpgsql as $$ begin perform pg_advisory_xact_lock_shared(${gateLock}); return new; end $$;
      create trigger pass_gate before insert on operations for each row execute function pass_gate();
      create trigger pass_gate before insert on vm_events for each row execute function pass_gate();
      create trigger pass_gate before insert on vm_notes for each row execute function pass_gate();`)
    await database.exec((await computedMigration(database.db, [vms.toModel(), operations.toModel()]))!)
    // The writes here wait on locks for as long as the test takes to see them waiting, which a busy machine stretches
    // past the API's default second.
    app = createAdmin({
      resources: [vms, operations, vmEvents, vmNotes, transfers, folders],
      db: database.db,
      authenticate: testAuthenticator,
      options: { roles, statementTimeoutMs: 30_000, writeHooks: [renameOnEvent] },
    })
  })
  afterAll(async () => { await database?.close() })

  beforeEach(async () => {
    await database.exec(`truncate operations, vm_events, vm_notes, transfers; delete from vms; delete from folders;
      insert into vms (id, owner_id, name) values (1, 'alice', 'one'), (2, 'alice', 'two');
      insert into folders (id, owner_id, parent_id, name) values (10, 'alice', null, 'ten'), (11, 'alice', null, 'eleven');`)
    other = new pg.Client({ connectionString: database.url })
    await other.connect()
    return async () => { await other.end() }
  })

  const headers = { authorization: `Bearer ${signTestToken({ sub: 'alice', roles: ['member'] })}`, 'content-type': 'application/json' }
  const send = async (method: string, path: string, body: unknown) =>
    app.request(`/api/v1${path}`, { method, headers: { ...headers, ...(method !== 'POST' && { 'if-match': '*' }) }, body: JSON.stringify(body) })
  // Until `count` statements of this database wait on a lock, a row's or the gate's
  const waiting = async (count: number) => {
    for (let tries = 0; tries < 200; tries++) {
      const { rows } = await sql<{ count: number }>`select count(*)::int as count from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'`.execute(database.db)
      if (rows[0]!.count >= count) return
      await new Promise((resolve) => setTimeout(resolve, 25))
    }
    throw new Error(`Fewer than ${count} statements waited on a lock`)
  }
  const one = async <T>(query: string) => (await sql.raw<T>(query).execute(database.db)).rows[0]!
  // Runs both writes while the gate is shut, until both wait on it or on each other, then opens it
  const throughGate = async <T>(writes: () => Promise<T>[]) => {
    await other.query(`select pg_advisory_lock(${gateLock})`)
    const started = writes()
    await waiting(started.length)
    await other.query(`select pg_advisory_unlock(${gateLock})`)
    return Promise.allSettled(started)
  }

  describe('the fixture, in raw SQL', () => {
    const write = async (lock: string, statements: string) => {
      const session = new pg.Client({ connectionString: database.url })
      await session.connect()
      try {
        await session.query('begin')
        await session.query(`select id from vms where id = 1 and owner_id = 'alice' limit 1 ${lock}`)
        await session.query(statements)
        await session.query('commit')
      } finally {
        await session.end()
      }
    }
    for (const [what, statements] of [
      ['a rollup', 'insert into operations (vm_id) values (1)'],
      ['an update after the insert', `insert into vm_notes (vm_id) values (1); update vms set name = name || '+' where id = 1`],
    ] as const) {
      it(`deadlocks two writes holding the parent FOR SHARE when ${what} changes it`, async () => {
        const results = await throughGate(() => [write('for share', statements), write('for share', statements)])
        expect(results.map((result) => (result.status === 'rejected' ? (result.reason as { code?: string }).code : 'ok')).sort()).toEqual(['40P01', 'ok'])
      })

      it(`lets two writes holding the parent FOR NO KEY UPDATE when ${what} changes it wait for each other`, async () => {
        const results = await throughGate(() => [write('for no key update', statements), write('for no key update', statements)])
        expect(results.map((result) => result.status)).toEqual(['fulfilled', 'fulfilled'])
      })
    }
  })

  const statuses = (results: PromiseSettledResult<Response>[]) => results.map((result) => (result.status === 'fulfilled' ? result.value.status : 'threw'))

  it('creates two operations under one VM whose rollup they update: both 201', async () => {
    const results = await throughGate(() => [send('POST', '/operations', { vm_id: 1 }), send('POST', '/operations', { vm_id: 1 })])
    expect(statuses(results)).toEqual([201, 201])
    expect(await one('select operation_count from vms where id = 1')).toEqual({ operation_count: 2 })
  })

  it('creates two events under one VM whose write hook renames it: both 201, both renames kept', async () => {
    const results = await throughGate(() => [send('POST', '/vm_events', { vm_id: 1 }), send('POST', '/vm_events', { vm_id: 1 })])
    expect(statuses(results)).toEqual([201, 201])
    expect(await one('select name from vms where id = 1')).toEqual({ name: 'one++' })
  })

  it('runs two batches that each create a note under one VM and then rename it: both 200', async () => {
    const batch = (name: string) => send('POST', ':batchWrite', {
      ops: [
        { op: 'create', resource: 'vm_notes', data: { vm_id: 1 } },
        { op: 'update', resource: 'vms', key: 1, etag: '*', data: { name } },
      ],
    })
    const results = await throughGate(() => [batch('first'), batch('second')])
    expect(statuses(results)).toEqual([200, 200])
    expect(await one('select count(*)::int as count from vm_notes')).toEqual({ count: 2 })
    expect(['first', 'second']).toContain((await one<{ name: string }>('select name from vms where id = 1')).name)
  })

  // A held VM 1 makes the first write wait on it; a write locking in field order would take VM 2 first and deadlock
  it('creates two transfers naming the same two VMs in opposite fields: both 201', async () => {
    await other.query('begin')
    await other.query('update vms set name = name where id = 1')
    const first = send('POST', '/transfers', { source_vm_id: 1, target_vm_id: 2 })
    await waiting(1)
    const second = send('POST', '/transfers', { source_vm_id: 2, target_vm_id: 1 })
    await waiting(2)
    await other.query('commit')
    expect([(await first).status, (await second).status]).toEqual([201, 201])
    expect(await one('select count(*)::int as count from transfers')).toEqual({ count: 2 })
  })

  for (const [what, change, status, count] of [
    ['handed to another owner', `update vms set owner_id = 'bob' where id = 2`, 403, 0],
    ['renamed', `update vms set name = 'held' where id = 2`, 201, 1],
  ] as const) {
    it(`waits for the second VM of a transfer being ${what}, and answers ${status} once it is checked again`, async () => {
      await other.query('begin')
      await other.query(change)
      const response = send('POST', '/transfers', { source_vm_id: 1, target_vm_id: 2 })
      await waiting(1)
      await other.query('commit')
      expect((await response).status).toBe(status)
      expect(await one('select count(*)::int as count from transfers')).toEqual({ count })
    })
  }

  it('lets only one of two folders moved under each other at the same moment move, the tree staying without a cycle', async () => {
    await other.query('begin')
    await other.query('update folders set name = name where id in (10, 11)')
    const moves = [send('PATCH', '/folders/10', { parent_id: 11 }), send('PATCH', '/folders/11', { parent_id: 10 })]
    await waiting(2)
    await other.query('commit')
    const answers = (await Promise.all(moves)).map((response) => response.status).sort()
    expect(answers[0]).toBe(200)
    expect([403, 409]).toContain(answers[1])
    expect(await one('select count(*)::int as count from folders where parent_id is not null')).toEqual({ count: 1 })
  })
})
