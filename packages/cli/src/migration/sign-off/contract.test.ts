import { readFile } from 'node:fs/promises'
import { afterEach, describe, expect, it } from 'vitest'
import { fileWarnings, lintFiles } from '../older-code/lint-files'
import { checkMigrations } from '../snapshot/check'
import { readMigrationFiles } from '../snapshot/migration-files'
import { authOf, cleanProjects, counterIds, migrationsOf, newProject, testOrganizations } from '../snapshot/project-fixture'
import { runMigration, type MigrationRun } from '../snapshot/run-migration'
import { readSnapshot } from '../snapshot/snapshot-file'
import { dropMigration } from '../snapshot/drop'
import { contractIntro, writeContract } from './contract'
import { writeDelete } from './delete'

afterEach(cleanProjects)

const organizationsOn = authOf({ organizations: { enabled: true } }, true)
const organizationsOff = { ...authOf(), organizations: testOrganizations }

// A project with organizations on, then turned off with `off`.
const turnedOff = async (off: MigrationRun['off']) => {
  const projectDir = await newProject()
  const dir = migrationsOf(projectDir)
  const ids = counterIds()
  const migrate = (run: Partial<MigrationRun>) => runMigration({ projectDir, dir, auth: organizationsOn, modules: {}, database: undefined, protobaseVersion: '1.0.0', newId: ids, ...run })
  await migrate({})
  const offFile = (await migrate({ auth: organizationsOff, off }))!
  const run = { projectDir, dir, protobaseVersion: '1.0.0', newId: ids }
  return { projectDir, dir, run, migrate, offId: /^-- protobase:id (\S+)$/m.exec(await readFile(offFile, 'utf8'))![1]! }
}

describe('protobase migration contract', () => {
  it('archives a module turned off with archive, every statement under the mark naming that file, behind the gate', async () => {
    const { projectDir, dir, run, offId } = await turnedOff('archive')
    const file = await writeContract({ ...run, hours: 24 })
    expect(file).toMatch(/003_contract\.sql$/)
    const text = await readFile(file, 'utf8')
    expect(text).toContain('-- protobase:breaks-older-code')
    expect(text).toContain(`-- protobase:contract ${offId}\ndo $gate$`)
    expect(text).toContain(`select applied_at into applied from migrations.history where id = '${offId}';`)
    expect(text).toContain("if now() - applied < '24 hours'::interval then")
    expect(text).toContain('if not exists (select from migrations.history where applied_at > applied) then')
    expect(text).toContain('alter table "auth"."member" set schema "protobase_archive_3";')
    expect(text).toContain('alter table "auth"."session" rename column "active_organization_id" to "active_organization_id_archive";')
    expect(text).toContain('revoke all on schema "protobase_archive_3" from public, current_user;')
    // Each statement before the record block carries the mark.
    const chunks = text.slice(text.indexOf(contractIntro) + contractIntro.length, text.indexOf('-- protobase:record')).split('\n\n')
    const statements = chunks.filter((chunk) => chunk.split('\n').some((line) => line.trim() !== '' && !line.startsWith('-- ')))
    expect(statements.length).toBeGreaterThan(10)
    expect(statements.filter((statement) => !statement.includes(`-- protobase:contract ${offId}\n`))).toEqual([])
    expect(await lintFiles(await readMigrationFiles(dir))).toEqual([])
    expect(await checkMigrations(projectDir, dir, organizationsOff, {})).toEqual([])
    expect(fileWarnings(await readMigrationFiles(dir)).filter((line) => line.includes('without `-- protobase:contract`'))).toEqual([])
    const snapshot = (await readSnapshot(projectDir))!
    expect(snapshot.decisions.modules.kept).toEqual([])
    expect(snapshot.decisions.modules.archived).toMatchObject([{ module: 'organizations', schema: 'protobase_archive_3', store: 'auth', choice: 'archive', tables: expect.arrayContaining(['member', 'organization']) }])
    await expect(dropMigration(projectDir, dir)).rejects.toThrow('003_contract.sql signs off or deletes what an earlier migration retired')
  })

  it('refuses with nothing to sign off, as after keep', async () => {
    const { run } = await turnedOff('keep')
    await expect(writeContract({ ...run, hours: 24 })).rejects.toThrow('Nothing awaits a sign-off')
  })
})

describe('protobase migration delete', () => {
  it('drops the archive behind the gate and the watch, and forgets the steps of a module still off', async () => {
    const { projectDir, run } = await turnedOff('delete')
    await expect(writeDelete({ ...run, hours: 1, module: 'organizations' })).rejects.toThrow('organizations has no archive to delete: none is archived')
    const contract = await writeContract({ ...run, hours: 24 })
    const contractId = /^-- protobase:id (\S+)$/m.exec(await readFile(contract, 'utf8'))![1]!
    const text = await readFile(await writeDelete({ ...run, hours: 168, module: 'organizations' }), 'utf8')
    expect(text).toContain(`-- protobase:contract ${contractId}\ndo $gate$`)
    expect(text).not.toContain('where applied_at > applied')
    expect(text).toContain("where hour >= date_trunc('hour', now() - '168 hours'::interval)")
    expect(text).toMatch(/drop table "protobase_archive_3"\."[a-z]+", /)
    expect(text).toContain('alter table "auth"."session" drop column "active_organization_id_archive";')
    expect(text).toContain(`delete from "auth"."auth_steps" where "module" = 'organizations' or "target" = 'organizations';`)
    expect((await readSnapshot(projectDir))!.decisions.modules.archived).toEqual([])
  })

  it('refuses archive or delete again while the earlier archive is there, and forgets the steps of the module on again', async () => {
    const { run, migrate } = await turnedOff('archive')
    await writeContract({ ...run, hours: 24 })
    const on = await readFile((await migrate({}))!, 'utf8')
    expect(on).toContain(`delete from "auth"."auth_steps" where "module" = 'organizations' or "target" = 'organizations';`)
    expect(on.indexOf('delete from "auth"."auth_steps"')).toBeLessThan(on.indexOf('-- organizations 1 '))
    await expect(migrate({ auth: organizationsOff, off: 'archive' })).rejects.toThrow('organizations has an archive from an earlier time it was off: delete it first')
    const text = await readFile(await writeDelete({ ...run, hours: 168, module: 'organizations' }), 'utf8')
    expect(text).not.toContain('delete from "auth"."auth_steps"')
  })
})
