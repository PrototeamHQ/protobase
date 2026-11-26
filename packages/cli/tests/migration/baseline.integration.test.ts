import { randomBytes, randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import postgres from 'postgres'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { legacyVersions, offlineStepsMigration, recordTable, settingsStoreNames, stepsOfVersions } from '@protobase/server/internal'
import { testOrganizations } from '../../src/migration/snapshot/project-fixture'
import { migrationText } from '../../src/auth/migration-file'
import { afterFileOf, afterStatements } from '../../src/migration/record/after-file'
import { writeBaseline } from '../../src/migration/baseline/write-baseline'
import { textBeforeRecord } from '../../src/migration/record/record-block'
import { checkMigrations } from '../../src/migration/snapshot/check'
import { runMigration, type Section } from '../../src/migration/snapshot/run-migration'
import { trialContractions } from '../../src/migration/older-code/trial'
import { readSnapshot } from '../../src/migration/snapshot/snapshot-file'
import { databaseReachable, testDatabaseUrl } from '../support/database'
import { withDatabase } from '../support/serve-process'

vi.setConfig({ hookTimeout: 30_000 })

const url = testDatabaseUrl()
const reachable = await databaseReachable(url)
const maintenance = () => postgres(withDatabase(url, 'postgres'), { max: 1, onnotice: () => {} })
// Every feature with tables of its own on, so every module is.
const auth = { names: settingsStoreNames({ organizations: { enabled: true }, mcp: true, personalAccessTokens: { prefix: 'app_' }, personalMail: ['gmail'], signInDevices: true }), organizationsOn: true, organizations: testOrganizations }
// The versions of the former chain, and every version this Protobase ships, which goes on past them.
const former = Array.from({ length: 17 }, (_, at) => at + 1)
const shipped = legacyVersions.map(({ version }) => version)

const databases: string[] = []
const dirs: string[] = []

afterAll(async () => {
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })))
  const sql = maintenance()
  for (const name of databases) await sql.unsafe(`drop database if exists ${name} with (force)`)
  await sql.end()
})

const createDatabase = async () => {
  const name = `protobase_baseline_${randomBytes(4).toString('hex')}`
  const sql = maintenance()
  await sql.unsafe(`create database ${name}`)
  await sql.end()
  databases.push(name)
  return withDatabase(url, name)
}

const query = async <Row extends object>(databaseUrl: string, text: string) => {
  const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} })
  try {
    return [...(await sql.unsafe<Row[]>(text))]
  } finally {
    await sql.end()
  }
}

const label = ({ module, step, target }: { module: string; step: number; target: string }) => `${module} ${step}${target === module ? '' : ` on ${target}`}`
// Each part of a step the store recorded in auth_steps, sorted.
const steps = async (databaseUrl: string) => (await query<{ module: string; step: number; target: string }>(databaseUrl, 'select module, step, target from auth.auth_steps')).map(label).sort()
const formerSteps = stepsOfVersions(former).map(label).sort()
const everyStep = stepsOfVersions(shipped).map(label).sort()

// Applies a migration's .after.sql as `protobase migrate` does: each statement on its own, outside a transaction.
const applyAfter = async (databaseUrl: string, file: string) => {
  for (const statement of afterStatements(await readFile(afterFileOf(file), 'utf8'))) await query(databaseUrl, statement)
}

// A project whose one auth migration came before the snapshot, applied to a database at the former chain's version
// `last`, as Protobase 0.130 left it: the later parts are recorded while the file runs, so it skips them, and their
// rows go again, so the store records the steps up to `last`, and still has the former record of versions.
const olderStore = async (last: number) => {
  const databaseUrl = await createDatabase()
  const projectDir = await mkdtemp(path.join(tmpdir(), 'protobase-baseline-'))
  dirs.push(projectDir)
  const dir = path.join(projectDir, 'db/migrations')
  await mkdir(dir, { recursive: true })
  const file = migrationText(offlineStepsMigration(auth.names, undefined, auth.organizations)!.sql)
  await writeFile(path.join(dir, '001_auth.sql'), file)
  const later = stepsOfVersions(shipped.filter((version) => version > last))
  const skip = later.length === 0 ? '' : `insert into auth.auth_steps (module, step, target) values ${later.map(({ module, step, target }) => `('${module}', ${step}, '${target}')`).join(', ')};`
  await query(databaseUrl, `create schema auth; create table auth.auth_steps (module text, step integer, target text, applied_at timestamptz, primary key (module, step, target)); ${skip}`)
  await query(databaseUrl, file)
  await query(
    databaseUrl,
    `${later.map(({ module, step, target }) => `delete from auth.auth_steps where (module, step, target) = ('${module}', ${step}, '${target}');`).join('\n')}
    create table auth.auth_migrations (version integer primary key, name text not null, applied_at timestamptz default current_timestamp not null);
    insert into auth.auth_migrations (version, name) select version, 'earlier' from unnest(array[${former.filter((version) => version <= last).join(', ')}]) as version`,
  )
  return { databaseUrl, projectDir, dir }
}

const migrate = (projectDir: string, dir: string) => runMigration({ projectDir, dir, auth, modules: {}, database: undefined, protobaseVersion: '1.0.0', newId: randomUUID })

describe.skipIf(!reachable)('protobase migration baseline', () => {
  it('describes a store at the former chain’s last version in a file that changes nothing, after which the next migration writes only the later steps', async () => {
    const { databaseUrl, projectDir, dir } = await olderStore(17)
    await expect(migrate(projectDir, dir)).rejects.toThrow('start it with `protobase migration baseline`')

    const file = await writeBaseline({ projectDir, dir, auth, modules: {}, url: databaseUrl, protobaseVersion: '1.0.0', newId: randomUUID })
    expect(path.basename(file)).toBe('002_baseline.sql')
    const text = await readFile(file, 'utf8')
    expect(textBeforeRecord(text)).not.toMatch(/^(create|insert|drop|alter|do) /m)
    await query(databaseUrl, text)
    expect(await query(databaseUrl, `select name from ${recordTable}`)).toEqual([{ name: '002_baseline' }])
    expect(await steps(databaseUrl)).toEqual(formerSteps)
    expect(await readSnapshot(projectDir)).toMatchObject({
      endsAt: { file: '002_baseline.sql' },
      decisions: { modules: { kept: [], archived: [] }, organizations: { everOn: true, defaultOrganization: testOrganizations.default } },
    })

    const next = (await migrate(projectDir, dir))!
    expect((await readFile(next, 'utf8')).match(/^-- \w+ \d+ \w+/gm)).toEqual(['-- auth 6 drop_version_record', '-- organizations 3 default_organization', '-- organizations 3 default_organization'])
    await query(databaseUrl, await readFile(next, 'utf8'))
    await applyAfter(databaseUrl, next)
    expect(await steps(databaseUrl)).toEqual(everyStep)
    expect(await query(databaseUrl, "select to_regclass('auth.auth_migrations') is null as gone")).toEqual([{ gone: true }])
    expect(await migrate(projectDir, dir)).toBeUndefined()
    expect(await checkMigrations(projectDir, dir, auth, {})).toEqual([])
  })

  it('keeps the organization of each token of a store whose organizations were on, and refuses one without, naming it', async () => {
    const { databaseUrl, projectDir, dir } = await olderStore(17)
    await query(databaseUrl, await readFile(await writeBaseline({ projectDir, dir, auth, modules: {}, url: databaseUrl, protobaseVersion: '1.0.0', newId: randomUUID }), 'utf8'))
    await query(
      databaseUrl,
      `insert into auth."user" (id, name, email, email_verified, created_at, updated_at) values ('u1', 'Ana', 'ana@example.com', true, now(), now());
      insert into auth.organization (id, name, slug, created_at) values ('acme', 'Acme', 'acme', now());
      insert into auth.personal_access_token (id, user_id, name, token_hash, role, created_at, organization_id) values
        ('kept', 'u1', 'Invoices', 'hash-kept', 'sales', now(), 'acme'), ('orphan', 'u1', 'Reports', 'hash-orphan', 'sales', now(), null)`,
    )
    const database = { url: databaseUrl, parts: [], contractions: (sections: readonly Section[]) => trialContractions(databaseUrl, sections), readModule: async () => undefined }
    await expect(runMigration({ projectDir, dir, auth, modules: {}, database, protobaseVersion: '1.0.0', newId: randomUUID })).rejects.toThrow(
      'The auth store has 1 personal access tokens without an organization, which organizations were on for: orphan.',
    )

    await query(databaseUrl, "delete from auth.personal_access_token where id = 'orphan'")
    const next = (await runMigration({ projectDir, dir, auth, modules: {}, database, protobaseVersion: '1.0.0', newId: randomUUID }))!
    // Older code writes tokens without an organization, which the step then refuses: the file breaks it.
    expect(await readFile(next, 'utf8')).toContain('\n-- protobase:breaks-older-code\n')
    expect(await readFile(next, 'utf8')).toContain("-- The sign-in modules' steps: adds the constraint personal_access_token_organization_id_set to auth.personal_access_token, which rows written by older code may break.\n")
    await query(databaseUrl, await readFile(next, 'utf8'))
    expect(await query(databaseUrl, `select additive from migrations.history where name = '${path.basename(next, '.sql')}'`)).toEqual([{ additive: false }])
    await applyAfter(databaseUrl, next)
    expect(await query(databaseUrl, 'select id, organization_id from auth.personal_access_token')).toEqual([{ id: 'kept', organization_id: 'acme' }])
    const [column] = await query<{ is_nullable: string }>(databaseUrl, "select is_nullable from information_schema.columns where table_schema = 'auth' and table_name = 'personal_access_token' and column_name = 'organization_id'")
    expect(column).toEqual({ is_nullable: 'NO' })
    // The default organization is made beside the store's own, and no one becomes its member.
    expect(await query(databaseUrl, 'select id from auth.organization order by id')).toEqual([{ id: 'acme' }, { id: 'main' }])
    expect(await query(databaseUrl, 'select count(*)::int as count from auth.member')).toEqual([{ count: 0 }])
  })

  it("puts each module of a store at version 8 at its step, so the next migration writes only the later ones", async () => {
    const { databaseUrl, projectDir, dir } = await olderStore(8)
    await query(databaseUrl, await readFile(await writeBaseline({ projectDir, dir, auth, modules: {}, url: databaseUrl, protobaseVersion: '1.0.0', newId: randomUUID }), 'utf8'))
    expect((await readSnapshot(projectDir))!.model.auth!.modules.auth!.lastStep).toBe(1)

    const next = await readFile((await migrate(projectDir, dir))!, 'utf8')
    expect(next).not.toContain('-- auth 1 core')
    expect(next).toContain('-- auth 2 account_keys')
    await query(databaseUrl, next)
    expect(await steps(databaseUrl)).toEqual(everyStep)
    expect(await migrate(projectDir, dir)).toBeUndefined()
  })

  it('refuses a store that records versions alone, as a Protobase before 0.130 left it', async () => {
    const { databaseUrl, projectDir, dir } = await olderStore(17)
    await query(databaseUrl, 'drop table auth.auth_steps')
    await expect(writeBaseline({ projectDir, dir, auth, modules: {}, url: databaseUrl, protobaseVersion: '1.0.0', newId: randomUUID })).rejects.toThrow(
      'The auth store records its migrations by version in auth_migrations, without auth_steps, as a Protobase before 0.130 left it, which no step of this version of Protobase reads',
    )
  })

  it('refuses a second baseline once the project has the snapshot', async () => {
    const { databaseUrl, projectDir, dir } = await olderStore(17)
    await writeBaseline({ projectDir, dir, auth, modules: {}, url: databaseUrl, protobaseVersion: '1.0.0', newId: randomUUID })
    await expect(writeBaseline({ projectDir, dir, auth, modules: {}, url: databaseUrl, protobaseVersion: '1.0.0', newId: randomUUID })).rejects.toThrow('The project has protobase.snapshot.json already')
  })
})
