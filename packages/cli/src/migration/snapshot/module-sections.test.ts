import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { latestModules, noInput } from '@protobase/server/internal'
import { dropMigration } from './drop'
import { checkMigrations } from './check'
import { authOf, cleanProjects, counterIds, migrationsOf, newProject } from './project-fixture'
import { runMigration } from './run-migration'
import { modelHash, readSnapshot, writeSnapshot } from './snapshot-file'

afterEach(cleanProjects)

const withJobs = (projectDir: string, newId = counterIds()) =>
  runMigration({ projectDir, dir: migrationsOf(projectDir), auth: authOf(), modules: { jobs: noInput }, database: undefined, protobaseVersion: '1.0.0', newId })

const jobs = latestModules({ jobs: noInput }).jobs!
const functionsVersion = jobs.replaceables.functions!

describe('protobase migration with a schema module', () => {
  it('writes the jobs schema from the snapshot alone, after the auth store, and records it in the snapshot and the header', async () => {
    const dir = await newProject()
    const file = (await withJobs(dir))!
    expect(path.basename(file)).toBe('001_auth_jobs.sql')
    const text = await readFile(file, 'utf8')
    expect(text).toContain('\n-- protobase:modules {"jobs":{"lastStep":1,"replaceables":{"functions":3}}}\n')
    expect(text.indexOf('-- The jobs schema this version of Protobase needs.\n')).toBeGreaterThan(text.indexOf('-- The auth schema changes this version of Protobase needs.\n'))
    expect(text).toContain("-- pg-boss's tables at its schema version 45.\nSELECT pg_advisory_xact_lock")
    expect(text).not.toContain('protobase:breaks-older-code')
    expect((await readSnapshot(dir))!.model.modules).toEqual({ jobs })
    expect(await withJobs(dir)).toBeUndefined()
    expect(await checkMigrations(dir, migrationsOf(dir), authOf(), { jobs: noInput })).toEqual([])
  })

  it('writes the functions again, as breaking older code, for a snapshot that has an older version of them', async () => {
    const dir = await newProject()
    await withJobs(dir)
    // The snapshot as an earlier version's file left it, with the functions one version older.
    const snapshot = (await readSnapshot(dir))!
    const model = { ...snapshot.model, modules: { jobs: { lastStep: 1, replaceables: { functions: functionsVersion - 1 } } } }
    await writeSnapshot(dir, { ...snapshot, model, modelHash: modelHash(model) })
    const text = await readFile((await withJobs(dir, () => 'second'))!, 'utf8')
    expect(text).toContain('\n-- protobase:breaks-older-code\n')
    expect(text).toContain(`-- The jobs schema this version of Protobase needs: it replaces its functions at version ${functionsVersion - 1} with version ${functionsVersion}, which the code before does not run on.\n`)
    expect(text).not.toContain('CREATE TABLE')
  })

  it('keeps a module the config no longer needs, and drop takes the snapshot back to before it', async () => {
    const dir = await newProject()
    await runMigration({ projectDir: dir, dir: migrationsOf(dir), auth: authOf(), modules: {}, database: undefined, protobaseVersion: '1.0.0', newId: () => 'first' })
    const before = await readSnapshot(dir)
    await withJobs(dir, () => 'second')
    expect(await runMigration({ projectDir: dir, dir: migrationsOf(dir), auth: authOf(), modules: {}, database: undefined, protobaseVersion: '1.0.0', newId: () => 'third' })).toBeUndefined()
    expect((await readSnapshot(dir))!.model.modules).toEqual({ jobs })
    await dropMigration(dir, migrationsOf(dir))
    expect(await readSnapshot(dir)).toEqual(before)
  })

  it('reports in check a module the snapshot does not record, naming baseline', async () => {
    const dir = await newProject()
    await runMigration({ projectDir: dir, dir: migrationsOf(dir), auth: authOf(), modules: {}, database: undefined, protobaseVersion: '1.0.0', newId: () => 'first' })
    expect(await checkMigrations(dir, migrationsOf(dir), authOf(), { jobs: noInput })).toEqual([
      'the migrations do not record the jobs schema: run `protobase migration`, or `protobase migration baseline` against the database where a migration of an earlier version made it',
    ])
  })
})
