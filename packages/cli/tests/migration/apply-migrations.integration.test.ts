import { randomBytes } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import postgres from 'postgres'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { applyMigrations, lockTaken } from '../../src/migration/apply-migrations'
import { recordBlock, sqlHash } from '../../src/migration/record/record-block'
import { planMigrations } from '../../src/migration/plan-migrations'
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
    expect((await sql`select name from migrations.applied order by name`).map((row) => row.name)).toEqual(['001_one.sql', '002_more.sql'])
    expect((await sql`select column_name from information_schema.columns where table_name = 'one' order by column_name`).map((row) => row.column_name)).toEqual(['id', 'name'])

    printed.length = 0
    expect(await applyMigrations(sql, dir, (text) => printed.push(text))).toEqual([])
    expect(printed).toEqual(['the database is up to date\n'])
  })

  it("leaves another migration tool's version-keyed public.schema_migrations and its rows as they were", async () => {
    const sql = connect(await createDatabase())
    await sql`create table public.schema_migrations (version character varying not null primary key)`
    await sql`insert into public.schema_migrations values ('20240101000000'), ('20240202000000')`
    const dir = await migrationsDir({ '001_one.sql': 'create table one ();\n' })

    expect(await applyMigrations(sql, dir, quiet)).toEqual(['001_one.sql'])
    expect(await sql`select * from public.schema_migrations order by version`).toEqual([{ version: '20240101000000' }, { version: '20240202000000' }])
    expect((await sql`select name from migrations.applied`).map((row) => row.name)).toEqual(['001_one.sql'])
  })

  it('takes over the record an earlier Protobase kept in public.schema_migrations, applying nothing twice', async () => {
    const sql = connect(await createDatabase())
    await sql`create table public.schema_migrations (name text primary key, applied_at timestamptz not null default now())`
    await sql`create table one ()`
    await sql`insert into public.schema_migrations (name, applied_at) values ('001_one.sql', '2026-01-01T00:00:00Z')`
    const dir = await migrationsDir({ '001_one.sql': 'create table one ();\n', '002_two.sql': 'create table two ();\n' })

    expect(await applyMigrations(sql, dir, quiet)).toEqual(['002_two.sql'])
    const record = await sql`select name, applied_at from migrations.applied order by name`
    expect(record.map((row) => row.name)).toEqual(['001_one.sql', '002_two.sql'])
    expect(record[0]!.applied_at).toEqual(new Date('2026-01-01T00:00:00Z'))
    expect((await sql`select name from public.schema_migrations`).map((row) => row.name)).toEqual(['001_one.sql'])
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

  it('refuses at once while another run holds the lock, which applies its files', async () => {
    const databaseUrl = await createDatabase()
    const dir = await migrationsDir({ '001_slow.sql': 'create table one ();\nselect pg_sleep(1);\n' })

    const first = applyMigrations(connect(databaseUrl), dir, quiet)
    await new Promise((resolve) => setTimeout(resolve, 300))
    await expect(applyMigrations(connect(databaseUrl), dir, quiet)).rejects.toThrow(lockTaken)
    expect(await first).toEqual(['001_slow.sql'])
  })

  // The presets' db/migrate.ts scripts take the same lock, written out here rather than imported from the runner.
  it("refuses at once while a preset's migrate script holds the lock, which every example's takes", async () => {
    const databaseUrl = await createDatabase()
    const dir = await migrationsDir({ '001_one.sql': 'create table one ();\n' })
    const holder = await connect(databaseUrl).reserve()
    await holder`begin`
    await holder`select pg_try_advisory_xact_lock(7311946202)`

    await expect(applyMigrations(connect(databaseUrl), dir, quiet)).rejects.toThrow(lockTaken)
    await holder`commit`
    holder.release()
    expect(await applyMigrations(connect(databaseUrl), dir, quiet)).toEqual(['001_one.sql'])

    for (const example of ['automations', 'erp', 'property-portal', 'real-estate', 'scratch']) {
      const script = await readFile(path.join(root, 'tests/apps', example, 'db/migrate.ts'), 'utf8')
      expect(script).toContain('const lockKey = 7_311_946_202\n')
      expect(script).toContain('pg_try_advisory_xact_lock(${lockKey})')
    }
  })
})

// A migration as Protobase writes it: its statements, then the block that records it under `id`.
const recorded = (id: string, statements: string, row: { additive?: boolean | null; completed?: boolean; hashed?: boolean } = {}) => {
  const { additive = true, completed = true, hashed = true } = row
  const block = recordBlock({ id, number: 1, name: id, protobaseVersion: '1.0.0', model: {}, modelHash: 'hash', physical: {}, additive, completed }, hashed ? sqlHash(statements) : null)
  return `${statements}${block}`
}

const history = (sql: postgres.Sql) => sql`select id, sql_hash, additive, physical, completed_at is not null as completed from migrations.history order by applied_at`

const indexes = (sql: postgres.Sql) =>
  sql`select c.relname as index, i.indisvalid as valid from pg_index i join pg_class c on c.oid = i.indexrelid join pg_class t on t.oid = i.indrelid where t.relname = 'a' order by 1`

describe.skipIf(!reachable)('applyMigrations with the record of migrations', () => {
  it('applies a batch up to a file with an .after.sql, runs that outside the transaction, then the next batch', async () => {
    const sql = connect(await createDatabase())
    const dir = await migrationsDir({
      '001_a.sql': recorded('a', 'create table a (x integer);\n', { completed: false }),
      '001_a.after.sql': '-- Built without locking writes.\ncreate index concurrently if not exists a_x on a (x);\n',
      '002_b.sql': recorded('b', 'create table b ();\n'),
    })
    const printed: string[] = []

    expect(await applyMigrations(sql, dir, (text) => printed.push(text))).toEqual(['001_a.sql', '002_b.sql'])
    expect(printed).toEqual(['applying 001_a.sql\n', 'running 001_a.after.sql\n', 'applying 002_b.sql\n', 'applied 2 migrations\n'])
    expect(await indexes(sql)).toEqual([{ index: 'a_x', valid: true }])
    expect(await history(sql)).toEqual([
      { id: 'a', sql_hash: sqlHash('create table a (x integer);\n'), additive: true, physical: { after: [{ index: 'a_x', unique: false }] }, completed: true },
      { id: 'b', sql_hash: sqlHash('create table b ();\n'), additive: true, physical: {}, completed: true },
    ])
  })

  it('leaves a migration unfinished when its .after.sql stops, then drops the invalid index and builds it again', async () => {
    const sql = connect(await createDatabase())
    const files = {
      '001_a.sql': recorded('a', "create table a (x integer);\ninsert into a values (1), (1);\n", { completed: false }),
      '001_a.after.sql': 'create unique index concurrently if not exists a_x_key on a (x);\n',
      '002_b.sql': recorded('b', 'create table b ();\n'),
    }
    const dir = await migrationsDir(files)

    await expect(applyMigrations(sql, dir, quiet)).rejects.toThrow(/could not create unique index "a_x_key"/)
    expect(await indexes(sql)).toEqual([{ index: 'a_x_key', valid: false }])
    expect((await history(sql)).map(({ id, completed, physical }) => ({ id, completed, physical }))).toEqual([{ id: 'a', completed: false, physical: { after: [{ index: 'a_x_key', unique: true }] } }])

    await sql`delete from a where ctid in (select ctid from a limit 1)`
    const printed: string[] = []
    expect(await applyMigrations(sql, dir, (text) => printed.push(text))).toEqual(['002_b.sql'])
    expect(printed).toEqual(['finishing 001_a.after.sql\n', 'applying 002_b.sql\n', 'applied 1 migrations\n'])
    expect(await indexes(sql)).toEqual([{ index: 'a_x_key', valid: true }])
    expect((await history(sql)).map(({ id, completed }) => ({ id, completed }))).toEqual([
      { id: 'a', completed: true },
      { id: 'b', completed: true },
    ])
  })

  it("fills a hand-written file's hash and additive mark from the text it applies", async () => {
    const sql = connect(await createDatabase())
    const statements = '-- protobase:id c\n-- protobase:custom\n-- protobase:additive\ncreate table c ();\n'
    const dir = await migrationsDir({ '001_c.sql': recorded('c', statements, { additive: null, hashed: false }) })

    await applyMigrations(sql, dir, quiet)
    expect((await history(sql)).map(({ sql_hash, additive }) => ({ sql_hash, additive }))).toEqual([{ sql_hash: sqlHash(statements), additive: true }])
  })

  it('applies nothing twice when a recorded file is renamed, finding it by its id', async () => {
    const sql = connect(await createDatabase())
    const text = recorded('a', 'create table a ();\n')
    await applyMigrations(sql, await migrationsDir({ '001_a.sql': text }), quiet)

    expect(await applyMigrations(sql, await migrationsDir({ '003_a.sql': text }), quiet)).toEqual([])
  })

  it('refuses an .after.sql beside a migration without a record block', async () => {
    const sql = connect(await createDatabase())
    const dir = await migrationsDir({ '001_a.sql': 'create table a (x integer);\n', '001_a.after.sql': 'create index concurrently a_x on a (x);\n' })

    await expect(applyMigrations(sql, dir, quiet)).rejects.toThrow('001_a.after.sql is beside 001_a.sql, which has no record block to mark complete')
  })
})

describe.skipIf(!reachable)('planMigrations', () => {
  it('prints each pending file with its SQL, applying and recording nothing', async () => {
    const sql = connect(await createDatabase())
    const dir = await migrationsDir({ '001_one.sql': 'create table one (id integer primary key);\n', '002_two.sql': 'create table two ();\n' })
    await applyMigrations(sql, await migrationsDir({ '001_one.sql': 'create table one (id integer primary key);\n' }), quiet)
    const printed: string[] = []

    expect(await planMigrations(sql, dir, (text) => printed.push(text))).toEqual(['002_two.sql'])
    expect(printed).toEqual(['-- 002_two.sql\ncreate table two ();\n\n', '1 migrations to apply; nothing was applied\n'])
    expect(await tables(sql)).toEqual(['one'])
    expect((await sql`select name from migrations.applied`).map((row) => row.name)).toEqual(['001_one.sql'])
  })

  it('prints every file of a database that never ran migrate, without making its record', async () => {
    const sql = connect(await createDatabase())
    const dir = await migrationsDir({ '001_one.sql': 'create table one ();\n' })

    expect(await planMigrations(sql, dir, quiet)).toEqual(['001_one.sql'])
    expect((await sql`select to_regclass('migrations.applied') is null as fresh`)[0]!.fresh).toBe(true)
  })
})
