import { Kysely, sql } from 'kysely'
import { PGliteDialect } from 'kysely-pglite-dialect'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { runReadOnlyQuery, runReadWriteQuery } from '../src/assistant/run-query'
import { createEmptyPg } from '../../../test-support/pglite-snapshot'

let db: Kysely<any>
beforeAll(async () => {
  const pg = await createEmptyPg()
  await pg.exec(`
    create table notes (id integer generated always as identity primary key, body text not null);
    create sequence ticket_numbers;
    create function add_note(text) returns integer language sql as 'insert into notes (body) values ($1) returning id';
  `)
  db = new Kysely({ dialect: new PGliteDialect(pg) })
})
afterAll(async () => { await db.destroy() })
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
