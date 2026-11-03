import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Kysely, PostgresDialect } from 'kysely'
import pg from 'pg'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ownedDefinitionsMigration, userTablesMigration } from '@protobase/server'
import { runDoctor } from '../../src/doctor/run'
import { runEject } from '../../src/eject/run'
import { loadDataConfig } from '../../src/project/load-data-config'
import { root } from '../support/auth-project'
import { databaseReachable, testDatabaseUrl } from '../support/database'
import { withDatabase } from '../support/serve-process'

const url = testDatabaseUrl()
const reachable = await databaseReachable(url)
const suffix = randomBytes(4).toString('hex')
const live = `protobase_eject_live_${suffix}`
const fresh = `protobase_eject_fresh_${suffix}`
// Inside tests/apps/erp, so the written config resolves the same packages.
const projectDir = path.join(root, 'tests/apps/erp', `.cli-test-eject-${suffix}`)
const configDir = path.join(projectDir, 'config')
const migrationsDir = path.join(projectDir, 'db/migrations')
const connection = (database: string) => postgres(withDatabase(url, database), { max: 1, onnotice: () => {} })

// What the user tables API makes: the table, a column and an index per field, and the title's search index.
const notesTable = `
  create table user_tables.notes (id bigint generated always as identity primary key);
  alter table user_tables.notes add column title text; create index on user_tables.notes (title);
  alter table user_tables.notes add column body text; create index on user_tables.notes using gin (body gin_trgm_ops);
  alter table user_tables.notes add column price numeric(12, 2); create index on user_tables.notes (price);
  alter table user_tables.notes add column meta jsonb;
  create index on user_tables.notes using gin (title gin_trgm_ops);
  insert into table_definitions.tables (name, singular_label, plural_label, title_field) values ('notes', 'Note', 'Notes', 'title');
  insert into table_definitions.fields (table_id, name, label, type, required, position, precision, scale) values
    (1, 'title', 'Title', 'text', false, 1, null, null), (1, 'body', 'Body', 'long_text', false, 2, null, null),
    (1, 'price', 'Price', 'decimal', false, 3, 12, 2), (1, 'meta', 'Details', 'json', false, 4, null, null);
  insert into user_tables.notes (title, price) values ('First', 1.50);
`

// An organization's table of the same name, as the user tables API makes it: its own table, `t<id>_notes`.
const organizationNotes = `
  insert into table_definitions.tables (name, organization_id, singular_label, plural_label) values ('notes', '7', 'Note', 'Notes');
  create table user_tables.t2_notes (id bigint generated always as identity primary key, organization_id text not null);
`

// The table as the catalogue has it: columns, constraints and indexes, with its rows.
const catalog = async (database: string) => {
  const sql = connection(database)
  const columns = await sql`select attname, format_type(atttypid, atttypmod) as type, attnotnull, attidentity, atthasdef from pg_attribute
    where attrelid = 'user_tables.notes'::regclass and attnum > 0 and not attisdropped order by attnum`
  const constraints = await sql`select conname, pg_get_constraintdef(oid) as definition from pg_constraint where conrelid = 'user_tables.notes'::regclass order by conname`
  const indexes = await sql`select indexrelid::regclass::text as name, pg_get_indexdef(indexrelid) as definition from pg_index where indrelid = 'user_tables.notes'::regclass order by 1`
  const [counted] = await sql<{ rows: number }[]>`select count(*)::int as rows from user_tables.notes`
  await sql.end()
  return { columns: [...columns], constraints: [...constraints], indexes: [...indexes], rows: counted!.rows }
}

// The schemas of user tables, as the project's earlier migration makes them.
const addUserTablesSchemas = async (database: string) => {
  const db = new Kysely<any>({ dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: withDatabase(url, database), max: 1 }) }) })
  const sql = connection(database)
  await sql.unsafe((await userTablesMigration(db))!)
  await Promise.all([db.destroy(), sql.end()])
}

const applyMigrations = async (database: string) => {
  const sql = connection(database)
  for (const file of (await readdir(migrationsDir)).sort()) await sql.unsafe(await readFile(path.join(migrationsDir, file), 'utf8'))
  await sql.end()
}

describe.skipIf(!reachable)('protobase eject', () => {
  const lines: string[] = []
  const eject = (names: string[]) => runEject({ url: withDatabase(url, live), names, configDir, migrationsDir, projectDir }, (text) => lines.push(text))

  beforeAll(async () => {
    const admin = connection('postgres')
    await admin.unsafe(`create database ${live}`)
    await admin.unsafe(`create database ${fresh}`)
    await admin.end()
    for (const database of [live, fresh]) await addUserTablesSchemas(database)
    const sql = connection(live)
    await sql.unsafe(notesTable)
    await sql.end()
    await mkdir(projectDir, { recursive: true })
    await writeFile(path.join(projectDir, 'protobase.config.ts'), 'export default { auth: false, userTables: true }\n')
  })

  afterAll(async () => {
    await rm(projectDir, { recursive: true, force: true })
    const admin = connection('postgres')
    for (const database of [live, fresh]) await admin.unsafe(`drop database if exists ${database} with (force)`)
    await admin.end()
  })

  it("writes the table's config and a migration, and doctor passes on it", async () => {
    lines.length = 0
    await eject(['notes'])
    expect(await readFile(path.join(configDir, 'notes/data.ts'), 'utf8')).toContain("export const notes = resource('notes')\n  .table('user_tables.notes')")
    expect(await readFile(path.join(configDir, 'notes/ui.ts'), 'utf8')).toContain(".names({ singular: 'Note', plural: 'Notes' })")
    expect(await readdir(migrationsDir)).toEqual(['001_eject_notes.sql'])
    expect(lines.join('')).toContain('Checked 1 resources: 0 errors')
    expect(lines.at(-1)).toContain('Deploy this soon')
    await expect(eject(['notes'])).rejects.toThrow('"notes" is a resource in code already, in notes/data.ts')
    await expect(eject(['tasks'])).rejects.toThrow('No table users added is named "tasks"')
  }, 60_000)

  it('changes nothing where the table is, and makes the same table on an empty database, where doctor passes', async () => {
    const before = await catalog(live)
    await applyMigrations(live)
    expect(await catalog(live)).toEqual(before)
    expect(before.rows).toBe(1)

    await applyMigrations(fresh)
    expect(await catalog(fresh)).toEqual({ ...before, rows: 0 })
    const report = await runDoctor({ url: withDatabase(url, fresh), configDir, projectDir }, () => {})
    expect(report.errors).toBe(0)
  }, 60_000)

  it("has the next migration delete the definition code owns, not an organization's of the same name, and nothing for one it does not", async () => {
    const sql = connection(live)
    await sql.unsafe(organizationNotes)
    await sql.end()
    const { models } = await loadDataConfig(configDir, projectDir)
    const db = new Kysely<any>({ dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: withDatabase(url, live), max: 1 }) }) })
    expect(await ownedDefinitionsMigration(db, models)).toBe("delete from table_definitions.tables where table_name in ('notes');")
    expect(await ownedDefinitionsMigration(db, models.map((model) => ({ ...model, table: { name: 'notes' } })))).toBeUndefined()
    await db.destroy()
  }, 60_000)

  it("refuses an organization's table, whose records eject's resource would not keep in it", async () => {
    await expect(eject(['t2_notes'])).rejects.toThrow('"t2_notes" belongs to an organization')
    expect(existsSync(path.join(configDir, 't2_notes'))).toBe(false)
  }, 60_000)

  // Its own folders, as a project file once imported stays loaded by its path.
  it('refuses, putting every file back, when doctor cannot check the config it wrote', async () => {
    const brokenDir = path.join(projectDir, 'config-broken')
    const brokenMigrations = path.join(projectDir, 'db-broken/migrations')
    await mkdir(path.join(brokenDir, 'broken'), { recursive: true })
    await writeFile(path.join(brokenDir, 'broken/data.ts'), "export const broken = resource('broken')\n")
    await writeFile(path.join(brokenDir, 'index.ts'), "export { broken } from './broken/data'\n")
    const run = runEject({ url: withDatabase(url, live), names: ['notes'], configDir: brokenDir, migrationsDir: brokenMigrations, projectDir }, () => {})
    await expect(run).rejects.toThrow()
    expect((await readdir(brokenDir)).sort()).toEqual(['broken', 'index.ts'])
    expect(await readFile(path.join(brokenDir, 'index.ts'), 'utf8')).toBe("export { broken } from './broken/data'\n")
    expect(existsSync(path.join(projectDir, 'db-broken'))).toBe(false)
  }, 60_000)
})
