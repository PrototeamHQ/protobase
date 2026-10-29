import { Kysely, sql } from 'kysely'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { checkQueryRunner, queryRunnerMigration } from '../src/assistant/query-runner/query-runner'
import { runReadOnlyQuery, runReadWriteQuery } from '../src/assistant/run-query'
import { openSnapshotDb } from '../../../test-support/sql-snapshot'

const model = (name: string) => resource(name).table(name).fields({ id: f.integer() }).primaryKey((r) => r.id).toModel()
const models = [model('notes'), model('locked'), model('numbers')]
// `secrets.session` stands in for the auth store; `hidden` is a table no resource reads.
const authTables = { tables: [{ schema: 'secrets', name: 'session' }], schemas: [] }

let db: Kysely<any>
let checkedBefore: Promise<void>
beforeAll(async () => {
  const pg = await openSnapshotDb('empty')
  await pg.exec(`
    create table notes (id integer generated always as identity primary key, body text not null);
    create sequence ticket_numbers;
    create function add_note(text) returns integer language sql as 'insert into notes (body) values ($1) returning id';
    create schema secrets;
    create table secrets.session (token text);
    insert into secrets.session values ('secret-token');
    create table hidden (x integer);
    create table locked (x integer);
    alter table locked enable row level security;
    insert into locked values (1);
    create table numbers (big bigint, price numeric(10, 2), small integer);
    insert into numbers values (9007199254740993, 12.50, 7);
  `)
  db = new Kysely({ dialect: pg.dialect })
  checkedBefore = checkQueryRunner(db, authTables)
  await checkedBefore.catch(() => undefined)
  await pg.exec((await queryRunnerMigration(db, models, authTables))!)
})
afterAll(async () => {
  await sql`do $$ begin execute format('drop owned by %I', left(current_database(), 57) || '_query'); execute format('drop role %I', left(current_database(), 57) || '_query'); end $$`.execute(db)
  await db.destroy()
})
beforeEach(async () => {
  await sql`truncate notes restart identity`.execute(db)
  await sql`insert into notes (body) values ('first'), ('second'), ('third')`.execute(db)
})

const count = async () => Number((await sql<{ n: number }>`select count(*)::int as n from notes`.execute(db)).rows[0]!.n)

describe('runReadOnlyQuery', () => {
  it('returns columns and rows, capped at the row limit', async () => {
    expect(await runReadOnlyQuery(db, 'select id, body from notes order by id;')).toEqual({ columns: ['id', 'body'], rows: [[1, 'first'], [2, 'second'], [3, 'third']], truncated: false })
    expect(await runReadOnlyQuery(db, 'select body from notes order by id', { rowLimit: 2 })).toEqual({ columns: ['body'], rows: [['first'], ['second']], truncated: true })
    expect(await runReadOnlyQuery(db, 'with b as (select body from notes) select count(*)::int as n from b -- a comment')).toEqual({ columns: ['n'], rows: [[3]], truncated: false })
  })

  // Every attempt to write, or to leave the read-only transaction, fails and changes nothing.
  const escapes = {
    'a write': 'delete from notes',
    'COMMIT, then a write': 'commit; delete from notes',
    'a second statement': 'select 1; delete from notes',
    'closing the wrapper to add a statement': 'select 1) select 1; delete from notes; with result as (select 1',
    'SET TRANSACTION READ WRITE': 'set transaction read write',
    'switching to read-write with set_config': `select set_config('transaction_read_only', 'off', true)`,
    'a writable CTE': 'with gone as (delete from notes returning *) select * from gone',
    'a writable CTE after closing the wrapper': 'select 1), gone as (delete from notes returning 1) select * from gone, (select 1',
    'nextval': `select nextval('ticket_numbers')`,
    'setval': `select setval('ticket_numbers', 100)`,
    'a DO block': `do $$ begin delete from notes; end $$`,
    'a function that writes': `select add_note('sneaky')`,
    'ending the transaction with ROLLBACK first': 'rollback; delete from notes',
  }
  for (const [name, statement] of Object.entries(escapes)) {
    it(`refuses ${name}`, async () => {
      await expect(runReadOnlyQuery(db, statement)).rejects.toThrow()
      expect(await count()).toBe(3)
      expect(Number((await sql<{ n: string }>`select last_value::int as n from ticket_numbers`.execute(db)).rows[0]!.n)).toBe(1)
    })
  }

  // The query role reads the resources' tables only, and the statement cannot become the app's role again.
  const refusals = {
    'an auth table': ['select * from secrets.session', 'permission denied for schema secrets'],
    'switching the role back inside the statement': [`select set_config('role', 'none', true), query_to_xml('select * from secrets.session', true, false, '')`, 'cannot set parameter "role" within security-definer function'],
    'switching the session authorization': [`select set_config('session_authorization', current_user, true)`, 'cannot set parameter "session_authorization" within security-definer function'],
    'a table without a resource': ['select * from hidden', 'permission denied for table hidden'],
    'a second SELECT after closing the wrapper': ['select 1) r; select body from notes, (select 1', 'cannot open multi-query plan as cursor'],
  }
  for (const [name, [statement, message]] of Object.entries(refusals)) {
    it(`refuses ${name}`, async () => {
      await expect(runReadOnlyQuery(db, statement!)).rejects.toThrow(message)
    })
  }

  it('keeps large and decimal numbers exact, as text', async () => {
    expect(await runReadOnlyQuery(db, 'select big, price, small from numbers')).toEqual({ columns: ['big', 'price', 'small'], rows: [['9007199254740993', '12.50', 7]], truncated: false })
  })

  it('reads a table with row-level security as its owner does', async () => {
    expect((await runReadOnlyQuery(db, 'select x from locked')).rows).toEqual([[1]])
  })

  it('rolls back session settings it changes', async () => {
    await runReadOnlyQuery(db, `select set_config('search_path', 'nowhere', false)`)
    expect((await sql<{ value: string }>`select current_setting('search_path') as value`.execute(db)).rows[0]!.value).not.toBe('nowhere')
  })

  it('runs under the statement timeout', async () => {
    expect((await runReadOnlyQuery(db, `select current_setting('statement_timeout') as timeout`, { timeoutMs: 1234 })).rows).toEqual([['1234ms']])
  })
})

describe('runReadWriteQuery', () => {
  it('commits one write and returns what it returned', async () => {
    expect(await runReadWriteQuery(db, `update notes set body = 'changed' where id = 1 returning id, body`)).toEqual({ columns: ['id', 'body'], rows: [[1, 'changed']], truncated: false })
    expect((await sql<{ body: string }>`select body from notes where id = 1`.execute(db)).rows[0]!.body).toBe('changed')
  })

  it('runs exactly one statement, and nothing of a failed one', async () => {
    await expect(runReadWriteQuery(db, 'delete from notes where id = 1 returning id; delete from notes')).rejects.toThrow()
    await expect(runReadWriteQuery(db, `insert into notes (body) values ('x') returning id), x as (select 1/0) select * from x, (select 1`)).rejects.toThrow()
    expect(await count()).toBe(3)
  })
})

const rolledBack = new Error('rolled back')

describe('the query runner', () => {
  it('is current once its migration applied, until a resource is added', async () => {
    expect(await queryRunnerMigration(db, models, authTables)).toBeUndefined()
    await sql`create table later (id integer)`.execute(db)
    expect(await queryRunnerMigration(db, [...models, model('later')], authTables)).toContain(`'grant select on table %I.%I to %I', 'public', 'later'`)
  })

  it('refuses startup before its migration, and passes after it', async () => {
    await expect(checkedBefore).rejects.toThrow("The query role of the assistant's read-only queries is missing. Write it as a migration with `protobase migration`")
    await expect(checkQueryRunner(db, authTables)).resolves.toBeUndefined()
  })

  it('refuses startup while the role can read an auth table', async () => {
    const attempt = db.transaction().execute(async (trx) => {
      await sql`do $$ begin execute format('grant usage on schema secrets to %I', left(current_database(), 57) || '_query'); execute format('grant select on secrets.session to %I', left(current_database(), 57) || '_query'); end $$`.execute(trx)
      await expect(checkQueryRunner(trx, authTables)).rejects.toThrow("The query role of the assistant's read-only queries can read the auth schema.")
      throw rolledBack
    })
    await expect(attempt).rejects.toBe(rolledBack)
  })

  it('refuses startup while the role may call a security-definer function that reads the auth store', async () => {
    const attempt = db.transaction().execute(async (trx) => {
      await sql`create function public.session_token() returns text language sql security definer as 'select token from secrets.session limit 1'`.execute(trx)
      await expect(checkQueryRunner(trx, authTables)).rejects.toThrow('can read the auth schema through the security-definer functions public.session_token(). Revoke execute on them from PUBLIC')
      await sql`revoke execute on function public.session_token() from public`.execute(trx)
      await expect(checkQueryRunner(trx, authTables)).resolves.toBeUndefined()
      throw rolledBack
    })
    await expect(attempt).rejects.toBe(rolledBack)
  })
})
