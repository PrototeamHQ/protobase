import { randomBytes } from 'node:crypto'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { servedConfig } from '../support/served-config'
import { migrationProject } from '../../src/migration/load-project'
import { migrationParts } from '../../src/migration/parts'
import { signInGuide } from '../../src/migration/summary'
import { writeMigrations } from '../../src/migration/write-migrations'
import { bin, root, run } from '../support/auth-project'
import { databaseReachable, testDatabaseUrl } from '../support/database'
import { withDatabase } from '../support/serve-process'

const url = testDatabaseUrl()
const reachable = await databaseReachable(url)
const suffix = randomBytes(4).toString('hex')
const database = `protobase_migration_${suffix}`
// Inside tests/apps/erp, so the project resolves the same packages.
const projectDir = path.join(root, 'tests/apps/erp', `.cli-test-${suffix}`)
const databaseUrl = withDatabase(url, database)
const maintenance = () => postgres(withDatabase(url, 'postgres'), { max: 1, onnotice: () => {} })

// The command itself, once: a fresh CLI process, about a second on Node through tsx and several on a busy CI runner, so
// the test that runs it gets 60s.
const migration = () => run([bin, 'migration'], projectDir, { DATABASE_URL: databaseUrl })

const notes = () => resource('notes').table('notes').fields({ id: f.integer().readOnly(), body: f.text() }).primaryKey((r) => r.id)

// The rest run what the command runs, in process: the files it writes for a config into the project's migrations, by
// name, none when the database is current.
const migrationFor = async (config: Parameters<typeof servedConfig>[0]) => {
  const project = await migrationProject(servedConfig(config), databaseUrl)
  try {
    return (await writeMigrations(migrationParts(project), path.join(projectDir, 'db/migrations'))).map((file) => path.basename(file))
  } finally {
    await project.close()
  }
}

// Applies the files not applied yet, in one transaction, as a project's migrate step does.
const applied = new Set<string>()
const applyAll = async () => {
  const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} })
  const dir = path.join(projectDir, 'db/migrations')
  const pending = (await readdir(dir)).sort().filter((file) => !applied.has(file))
  await sql.begin(async (tx) => {
    for (const file of pending) await tx.unsafe(await readFile(path.join(dir, file), 'utf8'))
  })
  for (const file of pending) applied.add(file)
  await sql.end()
}

describe.skipIf(!reachable)('protobase migration', () => {
  beforeAll(async () => {
    const sql = maintenance()
    await sql.unsafe(`create database ${database}`)
    await sql.end()
    const db = postgres(databaseUrl, { max: 1, onnotice: () => {} })
    await db.unsafe('create table notes (id integer generated always as identity primary key, body text not null)')
    await db.end()
    await mkdir(projectDir, { recursive: true })
  })

  afterAll(async () => {
    await rm(projectDir, { recursive: true, force: true })
    // Roles belong to the whole server, so the assistant's query role goes with the database.
    const db = postgres(databaseUrl, { max: 1, onnotice: () => {} })
    await db.unsafe(`do $$ declare query_role text := left(current_database(), 57) || '_query'; begin
      if exists (select from pg_roles where rolname = query_role) then execute format('drop owned by %I', query_role); execute format('drop role %I', query_role); end if; end $$`)
    await db.end()
    const sql = maintenance()
    await sql.unsafe(`drop database if exists ${database} with (force)`)
    await sql.end()
  })

  it('writes the jobs schema for a config with jobs, then nothing once applied', async () => {
    // Sign-in off, a declared job and its run, and a resource of the convention's config/.
    await writeFile(path.join(projectDir, 'protobase.config.ts'), `export default { auth: false, jobs: { 'prune-notes': {} } }\n`)
    await mkdir(path.join(projectDir, 'config'), { recursive: true })
    await mkdir(path.join(projectDir, 'jobs'), { recursive: true })
    await writeFile(path.join(projectDir, 'config/index.ts'), `import { f, resource } from '@protobase/schema'
export const notes = resource('notes').table('notes').fields({ id: f.integer().readOnly(), body: f.text() }).primaryKey((r) => r.id)
`)
    await writeFile(path.join(projectDir, 'jobs/prune-notes.ts'), 'export default () => {}\n')
    const first = await migration()
    // With sign-in off, the command says so rather than leave it to "up to date".
    const noSignIn = `sign-in is off, so nothing was written for it: see ${signInGuide}\n`
    expect([first.status, first.stdout, first.stderr]).toEqual([0, `wrote db/migrations/001_jobs.sql\napply them with the project's migrations\n${noSignIn}`, ''])
    expect(await readFile(path.join(projectDir, 'db/migrations/001_jobs.sql'), 'utf8')).toMatch(/^-- The jobs schema this version of Protobase needs, written by `protobase migration`\./)
    await applyAll()
    expect((await migration()).stdout).toBe(`the database is up to date; nothing to write\n${noSignIn}`)
  }, 60_000)

  it('writes the change capture of resources with events as the next migration, then nothing once applied', async () => {
    expect(await migrationFor({ config: { notes: notes().events((e) => e.crud()) } })).toEqual(['002_changes.sql'])
    await applyAll()
    expect(await migrationFor({ config: { notes: notes().events((e) => e.crud()) } })).toEqual([])

    const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} })
    await sql`insert into notes (body) values ('captured')`
    expect(await sql`select resource, op, new from changes.outbox`).toEqual([{ resource: 'notes', op: 'INSERT', new: { id: 1, body: 'captured' } }])
    await sql.end()
  })

  it('drops the triggers once the resource has no events', async () => {
    expect(await migrationFor({ config: { notes: notes() } })).toEqual(['003_changes.sql'])
    expect(await readFile(path.join(projectDir, 'db/migrations/003_changes.sql'), 'utf8')).toContain('drop trigger if exists "notes_changes" on public.notes')
    await applyAll()
  })

  it('writes the webhooks schema for a config with webhooks, after the change capture', async () => {
    const config = { webhooks: {}, config: { notes: notes().events((e) => e.crud()) } }
    expect(await migrationFor(config)).toEqual(['004_changes.sql', '005_webhooks.sql'])
    await applyAll()
    expect(await migrationFor(config)).toEqual([])
  })

  it("writes the role of the built-in assistant's read-only queries, then nothing once applied", async () => {
    const config = { webhooks: {}, config: { notes: notes().events((e) => e.crud()) }, assistant: { apiKey: 'test-key' } }
    expect(await migrationFor(config)).toEqual(['006_query.sql'])
    await applyAll()
    expect(await migrationFor(config)).toEqual([])
  })
})
