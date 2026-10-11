import { randomBytes } from 'node:crypto'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bin, root, run } from '../support/auth-project'
import { databaseReachable, testDatabaseUrl } from '../support/database'
import { withDatabase } from '../support/serve-process'

const url = testDatabaseUrl()
const reachable = await databaseReachable(url)
const suffix = randomBytes(4).toString('hex')
const database = `protobase_migration_${suffix}`
// Inside examples/erp, so the project resolves the same packages.
const projectDir = path.join(root, 'examples/erp', `.cli-test-${suffix}`)
const databaseUrl = withDatabase(url, database)
const maintenance = () => postgres(withDatabase(url, 'postgres'), { max: 1, onnotice: () => {} })

const config = (events: string) => `import { f, resource } from '@protobase/schema'
export const notes = resource('notes').table('notes').fields({ id: f.integer().readOnly(), body: f.text() }).primaryKey((r) => r.id)${events}
export default { config: { notes } }
`

const migration = () => run([bin, 'migration'], projectDir, { DATABASE_URL: databaseUrl })

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
    const sql = maintenance()
    await sql.unsafe(`drop database if exists ${database} with (force)`)
    await sql.end()
  })

  it('writes the jobs schema for a config with jobs, then nothing once applied', async () => {
    await writeFile(path.join(projectDir, 'protobase.config.ts'), `import { f, resource } from '@protobase/schema'
import { defineJob } from '@protobase/server'
export const notes = resource('notes').table('notes').fields({ id: f.integer().readOnly(), body: f.text() }).primaryKey((r) => r.id)
export const prune = defineJob({ name: 'prune-notes', run: () => {} })
export default { config: { notes }, jobs: { prune } }
`)
    const first = await migration()
    expect([first.status, first.stdout, first.stderr]).toEqual([0, "wrote db/migrations/001_jobs.sql\napply them with the project's migrations\n", ''])
    expect(await readFile(path.join(projectDir, 'db/migrations/001_jobs.sql'), 'utf8')).toMatch(/^-- The jobs schema this version of Protobase needs, written by `protobase migration`\./)
    await applyAll()
    expect((await migration()).stdout).toBe('the database is up to date; nothing to write\n')
  }, 60_000)

  it('writes the change capture of resources with events as the next migration, then nothing once applied', async () => {
    await writeFile(path.join(projectDir, 'protobase.config.ts'), config('.events((e) => e.crud())'))
    const first = await migration()
    expect([first.status, first.stdout, first.stderr]).toEqual([0, "wrote db/migrations/002_changes.sql\napply them with the project's migrations\n", ''])
    await applyAll()
    const again = await migration()
    expect(again.stdout).toBe('the database is up to date; nothing to write\n')

    const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} })
    await sql`insert into notes (body) values ('captured')`
    expect(await sql`select resource, op, new from changes.outbox`).toEqual([{ resource: 'notes', op: 'INSERT', new: { id: 1, body: 'captured' } }])
    await sql.end()
  })

  it('drops the triggers once the resource has no events', async () => {
    await writeFile(path.join(projectDir, 'protobase.config.ts'), config(''))
    const result = await migration()
    expect(result.stdout).toBe("wrote db/migrations/003_changes.sql\napply them with the project's migrations\n")
    expect(await readFile(path.join(projectDir, 'db/migrations/003_changes.sql'), 'utf8')).toContain('drop trigger if exists "notes_changes" on public.notes')
    await applyAll()
  })

})
