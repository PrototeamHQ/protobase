import { sql } from 'kysely'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { f, resource, where } from '@protobase/schema'
import { createAdmin } from '../src/index'
import { signTestToken, testAuthenticator } from '../../../test-support/server'
import { openPostgresDatabase, postgresTemplateReady, type PostgresDatabase } from '../../../test-support/postgres-database'

// What a recording cannot show: a create of a direct message another transaction is creating at the same moment waits
// for it, and both end on the one record: the other's commit answers this create with its key, its rollback lets this
// create go through.

const directMessages = resource('direct_messages')
  .table('direct_messages')
  .fields({
    id: f.integer().readOnly().filterable().sortable().dbDefault(),
    tenant_id: f.integer().readOnly(),
    member_ids: f.json(),
    member_key: f.text().readOnly().dbDefault(),
  })
  .primaryKey((r) => r.id)
  .tenant((r) => r.tenant_id)
  .access({ read: (ctx) => where.has('member_ids', ctx.user!.id as string) })
  .openExisting((r) => [r.tenant_id, r.member_key])

describe.skipIf(!(await postgresTemplateReady('empty')))('opening an existing record on Postgres', () => {
  let database: PostgresDatabase
  let app: ReturnType<typeof createAdmin>
  let blocker: pg.Client

  beforeAll(async () => {
    database = await openPostgresDatabase('empty')
    await database.exec(`
      create function member_key(members jsonb) returns text immutable language sql
        as $$ select string_agg(distinct member, ',' order by member) from jsonb_array_elements_text(members) member $$;
      create table direct_messages (id integer generated always as identity primary key, tenant_id integer not null, member_ids jsonb not null,
        member_key text generated always as (member_key(member_ids)) stored, unique (tenant_id, member_key));`)
    // The create waits on the other transaction for as long as the test takes to see it waiting, which a busy machine
    // stretches past the API's default second.
    app = createAdmin({ resources: [directMessages], db: database.db, authenticate: testAuthenticator, options: { statementTimeoutMs: 30_000 } })
  })
  afterAll(async () => { await database?.close() })

  beforeEach(async () => {
    await database.exec('truncate direct_messages restart identity')
    blocker = new pg.Client({ connectionString: database.url })
    await blocker.connect()
    return async () => { await blocker.end() }
  })

  const create = async () => {
    const headers = { authorization: `Bearer ${signTestToken({ sub: 'alice', roles: ['member'], tenant: 1 })}`, 'content-type': 'application/json' }
    const response = await app.request('/api/v1/direct_messages', { method: 'POST', headers, body: JSON.stringify({ member_ids: ['alice', 'bob'] }) })
    return { status: response.status, body: await response.json() }
  }
  // Until a statement of this database waits on a lock
  const waiting = async () => {
    for (let tries = 0; tries < 200; tries++) {
      const { rows } = await sql<{ count: number }>`select count(*)::int as count from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'`.execute(database.db)
      if (rows[0]!.count >= 1) return
      await new Promise((resolve) => setTimeout(resolve, 25))
    }
    throw new Error('No statement waited on a lock')
  }
  const startOther = async () => {
    await blocker.query('begin')
    const { rows } = await blocker.query<{ id: number }>(`insert into direct_messages (tenant_id, member_ids) values (1, '["bob", "alice"]') returning id`)
    return rows[0]!.id
  }
  const count = async () => (await sql<{ count: number }>`select count(*)::int as count from direct_messages`.execute(database.db)).rows[0]!.count

  it('waits for the other create and answers its record once it commits', async () => {
    const id = await startOther()
    const answer = create()
    await waiting()
    await blocker.query('commit')
    expect(await answer).toMatchObject({ status: 409, body: { type: 'urn:protobase:problem:conflict', existing: { key: String(id) } } })
    expect(await count()).toBe(1)
  })

  it('creates the record when the other create rolls back', async () => {
    await startOther()
    const answer = create()
    await waiting()
    await blocker.query('rollback')
    expect(await answer).toMatchObject({ status: 201, body: { member_key: 'alice,bob' } })
    expect(await count()).toBe(1)
  })

  it('answers two creates at once with the one record', async () => {
    const answers = await Promise.all([create(), create()])
    const created = answers.find((answer) => answer.status === 201)!
    const opened = answers.find((answer) => answer.status === 409)!
    expect(opened.body.existing).toEqual({ key: String(created.body.id) })
    expect(await count()).toBe(1)
  })
})
