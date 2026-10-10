import { randomBytes } from 'node:crypto'
import pg from 'pg'
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { runReadOnlyQuery, runReadWriteQuery } from '@protobase/server'
import { createPgDb } from '../../src/project/pg-db'
import { databaseReachable, testDatabaseUrl } from '../support/database'

// node-postgres sends a text without parameters with the simple protocol, which runs every statement in it; this
// checks that the assistant's queries never go that way, against a real server.
const url = testDatabaseUrl()
const reachable = await databaseReachable(url)
const schema = `assistant_${randomBytes(4).toString('hex')}`
const db = createPgDb(pg, url, 2)

describe.skipIf(!reachable)('assistant queries on Postgres over node-postgres', () => {
  beforeAll(async () => {
    await sql.raw(`
      create schema ${schema};
      create table ${schema}.notes (id integer generated always as identity primary key, body text not null);
      insert into ${schema}.notes (body) values ('first'), ('second');
      create sequence ${schema}.tickets;
    `).execute(db)
  })
  afterAll(async () => {
    await sql.raw(`drop schema if exists ${schema} cascade`).execute(db)
    await db.destroy()
  })

  const count = async () => Number((await sql.raw<{ n: number }>(`select count(*)::int as n from ${schema}.notes`).execute(db)).rows[0]!.n)

  const escapes = [
    `commit; delete from ${schema}.notes`,
    `select 1; delete from ${schema}.notes`,
    `select 1) select 1; delete from ${schema}.notes; with result as (select 1`,
    `rollback; delete from ${schema}.notes`,
    'set transaction read write',
    `select set_config('transaction_read_only', 'off', true)`,
    `with gone as (delete from ${schema}.notes returning *) select * from gone`,
    `select nextval('${schema}.tickets')`,
    `do $$ begin delete from ${schema}.notes; end $$`,
  ]
  it.each(escapes)('refuses %s', async (statement) => {
    await expect(runReadOnlyQuery(db, statement)).rejects.toThrow()
    expect(await count()).toBe(2)
  })

  it('is refused by Postgres as more than one command, not by a check of the text', async () => {
    await expect(runReadOnlyQuery(db, `select 1) select 1; delete from ${schema}.notes; with result as (select 1`)).rejects.toThrow('cannot insert multiple commands into a prepared statement')
  })

  it('cancels a statement that runs past the timeout', async () => {
    await expect(runReadOnlyQuery(db, 'select pg_sleep(5)', { timeoutMs: 100 })).rejects.toThrow('canceling statement due to statement timeout')
  })

  it('runs one approved write, and not a second statement after it', async () => {
    const smuggled = `delete from ${schema}.notes where id = 1 returning id) select 1; delete from ${schema}.notes; with result as (select 1`
    await expect(runReadWriteQuery(db, smuggled)).rejects.toThrow('cannot insert multiple commands into a prepared statement')
    expect(await count()).toBe(2)
    expect((await runReadWriteQuery(db, `delete from ${schema}.notes where id = 1 returning id`)).rows).toEqual([[1]])
    expect(await count()).toBe(1)
  })
})
