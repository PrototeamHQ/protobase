import { randomBytes } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import postgres from 'postgres'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { applyMigrations } from '../../src/migration/apply-migrations'
import { databaseReachable, testDatabaseUrl } from '../support/database'
import { withDatabase } from '../support/serve-process'

// afterAll drops every database the tests made, one at a time, and a loaded Postgres takes seconds for some drops.
vi.setConfig({ hookTimeout: 30_000 })

const url = testDatabaseUrl()
const reachable = await databaseReachable(url)
const root = path.resolve(import.meta.dirname, '../../../..')

const maintenance = () => postgres(withDatabase(url, 'postgres'), { max: 1, onnotice: () => {} })

// The runner connects as an app does: a role that owns its database and is no superuser.
const role = `protobase_migrator_${randomBytes(4).toString('hex')}`
const password = randomBytes(12).toString('hex')

// Each test gets a database of its own, owned by the role and dropped afterwards.
const databases: string[] = []
const createDatabase = async () => {
  const name = `protobase_apply_migrations_${randomBytes(4).toString('hex')}`
  const sql = maintenance()
  await sql.unsafe(`create database ${name} owner ${role}`)
  await sql.end()
  databases.push(name)
  const next = new URL(withDatabase(url, name))
  next.username = role
  next.password = password
  return next.toString()
}

const connections: postgres.Sql[] = []
const connect = (databaseUrl: string) => {
  const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} })
  connections.push(sql)
  return sql
}

const folders: string[] = []
const migrationsDir = async (files: Record<string, string>) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'protobase-apply-migrations-'))
  folders.push(dir)
  for (const [name, sql] of Object.entries(files)) await writeFile(path.join(dir, name), sql)
  return dir
}

const tables = async (sql: postgres.Sql) =>
  (await sql`select table_name from information_schema.tables where table_schema = 'public' order by table_name`).map((row) => row.table_name)

const quiet = () => {}

afterEach(async () => {
  await Promise.all(connections.splice(0).map((sql) => sql.end()))
  await Promise.all(folders.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

beforeAll(async () => {
  if (!reachable) return
  const sql = maintenance()
  await sql.unsafe(`create role ${role} with login nosuperuser nocreatedb nocreaterole password '${password}'`)
  await sql.end()
})

afterAll(async () => {
  if (!reachable) return
  const sql = maintenance()
  for (const name of databases) await sql.unsafe(`drop database if exists ${name} with (force)`)
  await sql.unsafe(`drop role if exists ${role}`)
  await sql.end()
})

describe.skipIf(!reachable)('applyMigrations', () => {
  it('applies the pending files in name order and records them; a second run applies nothing', async () => {
    const sql = connect(await createDatabase())
    const dir = await migrationsDir({
      '002_more.sql': 'alter table one add column name text;\n',
      '001_one.sql': 'create table one (id integer primary key);\n',
      'notes.txt': 'not a migration',
    })
    const printed: string[] = []

    expect(await applyMigrations(sql, dir, (text) => printed.push(text))).toEqual(['001_one.sql', '002_more.sql'])
    expect(printed).toEqual(['applying 001_one.sql\n', 'applying 002_more.sql\n', 'applied 2 migrations\n'])
    expect((await sql`select name from public.schema_migrations order by name`).map((row) => row.name)).toEqual(['001_one.sql', '002_more.sql'])
    expect((await sql`select column_name from information_schema.columns where table_name = 'one' order by column_name`).map((row) => row.column_name)).toEqual(['id', 'name'])

    printed.length = 0
    expect(await applyMigrations(sql, dir, (text) => printed.push(text))).toEqual([])
    expect(printed).toEqual(['the database is up to date\n'])
  })

  it('leaves the schema unchanged when a migration fails', async () => {
    const sql = connect(await createDatabase())
    const dir = await migrationsDir({ '001_one.sql': 'create table one ();\n', '002_two.sql': 'create table two ();\nselect 1/0;\n' })
    const printed: string[] = []

    await expect(applyMigrations(sql, dir, (text) => printed.push(text))).rejects.toThrow('division by zero')
    expect(printed.at(-1)).toBe('applying 002_two.sql\n')
    expect(await tables(sql)).toEqual([])
  })

  // A file that could end the runner's transaction would commit the files before it with no way back.
  it.each([
    ['a commit', 'commit;\ncreate table three ();'],
    ['a begin', 'begin;\ncreate table three ();'],
    ['a rollback', 'rollback;'],
    ['an end', 'end;'],
    ['a savepoint', 'savepoint s;\nrollback to savepoint s;'],
    ['a prepared transaction', "prepare transaction 'x';"],
    ['a do block that commits', 'do $$ begin commit; end $$;'],
    ['a procedure that commits', 'create procedure p() language plpgsql as $p$ begin commit; end $p$;\ncall p();'],
    ['an index built concurrently', 'create index concurrently on two (x);'],
    ['a vacuum', 'vacuum;'],
    ['an escape from the runner\'s do block', 'end $migration$; commit; do $migration$ begin create table three (); end $migration$;'],
  ])('refuses %s before it commits anything', async (_, statement) => {
    const sql = connect(await createDatabase())
    const dir = await migrationsDir({ '001_one.sql': 'create table one ();\n', '002_two.sql': `create table two (x integer);\n${statement}\n` })

    await expect(applyMigrations(sql, dir, quiet)).rejects.toThrow()
    expect(await tables(sql)).toEqual([])
    expect(await sql`select gid from pg_prepared_xacts`).toEqual([])
  })

  it('applies functions, do blocks and dollar quotes that use what the same file made', async () => {
    const sql = connect(await createDatabase())
    const dir = await migrationsDir({
      '001_mixed.sql': `create type mood as enum ('calm');
alter type mood add value 'busy';
create table q (v text, m mood);
create function f() returns int language sql as $migration$ select 1 $migration$;
create function count_q() returns bigint language plpgsql as $body$ begin return (select count(*) from q); end $body$;
do $d$ begin insert into q (v) values ('from do'); end $d$;
insert into q (v) values ('$migration$; commit; ''x''');
`,
    })

    expect(await applyMigrations(sql, dir, quiet)).toEqual(['001_mixed.sql'])
    expect((await sql`select f() as one, count_q() as rows`)[0]).toEqual({ one: 1, rows: '2' })
    expect((await sql`select v from q order by v`).map((row) => row.v)).toEqual(['$migration$; commit; \'x\'', 'from do'])
  })

  it('takes turns with another run on the same database', async () => {
    const databaseUrl = await createDatabase()
    const dir = await migrationsDir({ '001_slow.sql': 'create table one ();\nselect pg_sleep(1);\n' })

    const runs = await Promise.all([applyMigrations(connect(databaseUrl), dir, quiet), applyMigrations(connect(databaseUrl), dir, quiet)])
    expect(runs.map((applied) => applied.length).sort()).toEqual([0, 1])
  })

  // The presets' db/migrate.ts scripts take the same lock, written out here rather than imported from the runner.
  it("waits for the presets' lock, which every example's migrate script takes", async () => {
    const databaseUrl = await createDatabase()
    const dir = await migrationsDir({ '001_one.sql': 'create table one ();\n' })
    const holder = await connect(databaseUrl).reserve()
    await holder`begin`
    await holder`select pg_advisory_xact_lock(7311946202)`

    const printed: string[] = []
    const run = applyMigrations(connect(databaseUrl), dir, (text) => printed.push(text))
    await new Promise((resolve) => setTimeout(resolve, 500))
    expect(printed).toEqual([])

    await holder`commit`
    holder.release()
    expect(await run).toEqual(['001_one.sql'])

    for (const example of ['erp', 'property-portal', 'real-estate', 'scratch']) {
      expect(await readFile(path.join(root, 'tests/apps', example, 'db/migrate.ts'), 'utf8')).toContain('const lockKey = 7_311_946_202\n')
    }
  })
})
