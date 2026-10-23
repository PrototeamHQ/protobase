import { sql } from 'kysely'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { defineRoles, f, resource } from '@protobase/schema'
import { computedMigration, createAdmin } from '../src/index'
import { signTestToken, testAuthenticator } from '../../../test-support/server'
import { openPostgresDatabase, postgresTemplateReady, type PostgresDatabase } from '../../../test-support/postgres-database'

// What a recording cannot show: the parent stays locked from its check until the write commits, so a change to it at
// the same moment is waited for and checked again, and writes under one parent wait for each other instead of deadlocking.

const roles = defineRoles<'vms' | 'operations'>({
  member: ['vms.read', 'vms.update.own', 'operations.read', 'operations.create', 'operations.delete'],
  reader: ['vms.read.own', 'vms.update.own', 'operations.read', 'operations.create'],
})

const vms = resource('vms')
  .table('vms')
  .fields({
    id: f.integer().readOnly(),
    tenant_id: f.integer().readOnly(),
    owner_id: f.text().readOnly(),
    name: f.text(),
    deleted_at: f.timestamp().optional().readOnly(),
    operation_count: f.integer().rollup({ from: 'operations', via: 'vm_id', fn: 'count' }),
  })
  .primaryKey((r) => r.id)
  .tenant((r) => r.tenant_id)
  .owner((r) => r.owner_id)
  .softDelete((r) => r.deleted_at)
const operations = resource('operations')
  .table('operations')
  .fields({ id: f.integer().readOnly(), tenant_id: f.integer().readOnly(), vm_id: f.relation('vms'), kind: f.text() })
  .primaryKey((r) => r.id)
  .tenant((r) => r.tenant_id)
  .parent((r) => r.vm_id, 'update')

describe.skipIf(!(await postgresTemplateReady('empty')))('parent checks on Postgres', () => {
  let database: PostgresDatabase
  let app: ReturnType<typeof createAdmin>
  let blocker: pg.Client

  beforeAll(async () => {
    database = await openPostgresDatabase('empty')
    await database.exec(`
      create table vms (id integer primary key, tenant_id integer not null, owner_id text, name text not null, deleted_at timestamptz);
      create table operations (id integer generated always as identity primary key, tenant_id integer not null, vm_id integer not null references vms, kind text not null);`)
    await database.exec((await computedMigration(database.db, [vms.toModel(), operations.toModel()]))!)
    // The writes here wait on locks for as long as the test takes to see them waiting, which a busy machine stretches
    // past the API's default second.
    app = createAdmin({ resources: [vms, operations], db: database.db, authenticate: testAuthenticator, options: { roles, statementTimeoutMs: 30_000 } })
  })
  afterAll(async () => { await database?.close() })

  beforeEach(async () => {
    await database.exec(`truncate operations; delete from vms;
      insert into vms (id, tenant_id, owner_id, name) values (1, 1, 'alice', 'one'), (2, 1, 'alice', 'two');`)
    blocker = new pg.Client({ connectionString: database.url })
    await blocker.connect()
    return async () => { await blocker.end() }
  })

  const create = (vm_id: number, { sub = 'alice', role = 'member', tenant = 1 } = {}) =>
    app.request('/api/v1/operations', {
      method: 'POST',
      headers: { authorization: `Bearer ${signTestToken({ sub, roles: [role], tenant })}`, 'content-type': 'application/json' },
      body: JSON.stringify({ vm_id, kind: 'reboot' }),
    })
  const batch = (vmIds: number[]) =>
    app.request('/api/v1:batchWrite', {
      method: 'POST',
      headers: { authorization: `Bearer ${signTestToken({ sub: 'alice', roles: ['member'], tenant: 1 })}`, 'content-type': 'application/json' },
      body: JSON.stringify({ ops: vmIds.map((vm_id) => ({ op: 'create', resource: 'operations', data: { vm_id, kind: 'reboot' } })) }),
    })
  // Until `count` statements of this database wait on a lock
  const waiting = async (count: number) => {
    for (let tries = 0; tries < 200; tries++) {
      const { rows } = await sql<{ count: number }>`select count(*)::int as count from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'`.execute(database.db)
      if (rows[0]!.count >= count) return
      await new Promise((resolve) => setTimeout(resolve, 25))
    }
    throw new Error(`Fewer than ${count} statements waited on a lock`)
  }
  const operationCount = async () => (await sql<{ count: number }>`select count(*)::int as count from operations`.execute(database.db)).rows[0]!.count

  for (const [what, change] of [
    ['handed to another owner', `update vms set owner_id = 'bob' where id = 1`],
    ['soft deleted', `update vms set deleted_at = now() where id = 1`],
  ] as const) {
    it(`waits for a VM being ${what} and checks it again: refused, nothing written`, async () => {
      await blocker.query('begin')
      await blocker.query(change)
      const response = create(1)
      await waiting(1)
      await blocker.query('commit')
      expect((await response).status).toBe(403)
      expect(await operationCount()).toBe(0)
    })
  }

  it('refuses at once, without waiting on it, a caller who cannot see the VM', async () => {
    await blocker.query('begin')
    await blocker.query(`update vms set name = 'held' where id = 1`)
    expect((await create(1, { tenant: 2 })).status).toBe(403)
    expect((await create(1, { sub: 'bob', role: 'reader' })).status).toBe(403)
    await blocker.query('rollback')
    expect(await operationCount()).toBe(0)
  })

  it('lets creates under one VM whose rollup they update wait for each other, not deadlock', async () => {
    await blocker.query('begin')
    await blocker.query('update vms set name = name where id = 1')
    const responses = [create(1), create(1)]
    await waiting(2)
    await blocker.query('commit')
    expect((await Promise.all(responses)).map((response) => response.status)).toEqual([201, 201])
    expect((await sql<{ operation_count: number }>`select operation_count from vms where id = 1`.execute(database.db)).rows[0]!.operation_count).toBe(2)
  })

  it('answers the batch that deadlocks locking two VMs in the other order with 409, nothing of it written', async () => {
    await blocker.query('begin')
    await blocker.query('update vms set name = name where id = 1')
    const first = batch([1, 2])
    await waiting(1)
    const second = batch([2, 1])
    await waiting(2)
    await blocker.query('commit')
    const answers = await Promise.all([first, second])
    expect(answers.map((response) => response.status).sort()).toEqual([200, 409])
    const refused = await answers.find((response) => response.status === 409)!.json()
    expect(refused).toMatchObject({ type: 'urn:protobase:problem:conflict', detail: 'The record was written at the same time as another; send it again' })
    expect(JSON.stringify(refused)).not.toMatch(/vms|deadlock|40P01/)
    expect(await operationCount()).toBe(2)
  })
})
