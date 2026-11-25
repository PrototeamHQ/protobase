import { readFile } from 'node:fs/promises'
import postgres from 'postgres'
import { afterEach, describe, expect, it, onTestFinished } from 'vitest'
import { applyMigrations } from '../../packages/cli/src/migration/apply-migrations'
import { writeContract } from '../../packages/cli/src/migration/sign-off/contract'
import { writeDelete } from '../../packages/cli/src/migration/sign-off/delete'
import { authOf, cleanProjects, counterIds, migrationsOf, newProject, testOrganizations } from '../../packages/cli/src/migration/snapshot/project-fixture'
import { runMigration, type MigrationRun } from '../../packages/cli/src/migration/snapshot/run-migration'
import { openPostgresDatabase, postgresTemplateReady } from '../../test-support/postgres-database'

// The sign-off of an update that turned a sign-in module off with archive, and the delete after it, on real Postgres:
// nothing moves before the sign-off applies, which waits for the period and the next migration; the archive is the
// app's no more; and the delete waits until nothing wrote it for its period.

afterEach(cleanProjects)

const organizationsOn = authOf({ organizations: { enabled: true } }, true)
const organizationsOff = { ...authOf(), organizations: testOrganizations }

// A project and a database with organizations on, a user, a member and a session in them, and an app role that uses the store.
const project = async (on = organizationsOn) => {
  const database = await openPostgresDatabase('empty')
  const projectDir = await newProject()
  const dir = migrationsOf(projectDir)
  const sql = postgres(database.url, { max: 1, onnotice: () => {} })
  const ids = counterIds()
  const migration = (run: Partial<MigrationRun>) => runMigration({ projectDir, dir, auth: on, modules: {}, protobaseVersion: '1.0.0', newId: ids, database: undefined, ...run })
  const migrate = () => applyMigrations(sql, dir, () => {})
  const run = { projectDir, dir, protobaseVersion: '1.0.0', newId: ids }
  const idOf = async (file: string) => /^-- protobase:id (\S+)$/m.exec(await readFile(file, 'utf8'))![1]!
  // What `migrations.history` says once the file `id` was applied `hours` ago and another an hour after it.
  const appliedAgo = async (id: string, hours: number, followed = true) => {
    await sql`update migrations.history set applied_at = now() - make_interval(hours => ${hours}) where id = ${id}`
    if (followed) await sql`insert into migrations.history (id, name, protobase_version, model, model_hash, physical, applied_at, completed_at) values (${`after-${id}`}, 'later', '1.0.0', '{}', '', '{}', now() - make_interval(hours => ${hours - 1}), now() - make_interval(hours => ${hours - 1}))`
  }
  // Roles are the server's, so each database gets its own.
  const app = `${database.url.split('/').at(-1)}_app`
  const asApp = async <T>(query: (tx: postgres.TransactionSql) => Promise<T>) =>
    sql.begin(async (tx) => {
      await tx.unsafe(`set local role ${app}`)
      return query(tx)
    })
  onTestFinished(async () => {
    const admin = postgres(database.url, { max: 1, onnotice: () => {} })
    await admin.unsafe(`drop owned by ${app}`).then(() => admin.unsafe(`drop role ${app}`)).finally(() => admin.end())
  })
  await migration({})
  await migrate()
  await sql.unsafe(`create role ${app}; grant usage on schema auth to ${app}; grant all on all tables in schema auth to ${app}`)
  await sql`insert into auth."user" (id, name, email, email_verified) values ('ana', 'Ana', 'ana@example.com', true)`
  await sql`insert into auth.member (id, organization_id, user_id, role, created_at) values ('m1', 'main', 'ana', 'sales', now())`
  await sql`insert into auth.session (id, expires_at, token, updated_at, user_id, active_organization_id) values ('s1', now() + interval '1 day', 't1', now(), 'ana', 'main')`
  return { sql, migration, migrate, run, idOf, appliedAgo, asApp, app }
}

const schemaOf = async (sql: postgres.Sql, table: string) => (await sql`select table_schema from information_schema.tables where table_name = ${table}`).map((row) => row.table_schema as string)

// The foreign keys from a table outside `schema` to one in it.
const keysInto = async (sql: postgres.Sql, schema: string) =>
  sql`select conname from pg_constraint join pg_class target on target.oid = confrelid join pg_class source on source.oid = conrelid where contype = 'f' and target.relnamespace = ${schema}::regnamespace and source.relnamespace <> ${schema}::regnamespace`

describe.skipIf(!(await postgresTemplateReady('empty')))('signing off and deleting a module turned off, on real Postgres', () => {
  it('archives only once signed off, away from the app, and deletes only once nothing wrote it for the period', async () => {
    const { sql, migration, migrate, run, idOf, appliedAgo, asApp, app } = await project()
    try {
      // Off with archive: kept at once, as keep is.
      const offId = await idOf((await migration({ auth: organizationsOff, off: 'archive' }))!)
      await migrate()
      expect(await schemaOf(sql, 'member')).toEqual(['auth'])
      expect((await sql`select is_nullable from information_schema.columns where table_name = 'session' and column_name = 'active_organization_id'`)[0]!.is_nullable).toBe('YES')

      // A role that holds only a column of a table loses it too.
      await sql.unsafe(`revoke all on auth.member from ${app}; grant select (id) on auth.member to ${app}`)

      // The sign-off refuses before a later migration and before the period, archiving nothing.
      const contract = await writeContract({ ...run, hours: 24 })
      await expect(migrate()).rejects.toThrow('is followed by a migration applied after it')
      await appliedAgo(offId, 2)
      await expect(migrate()).rejects.toThrow('was applied 24 hours ago')
      expect(await schemaOf(sql, 'member')).toEqual(['auth'])
      await sql`delete from migrations.history where id = ${`after-${offId}`}`
      await appliedAgo(offId, 25)
      await migrate()

      // Archived: the tables moved with their rows, no foreign key from the tables still on into them, the column renamed.
      expect(await schemaOf(sql, 'member')).toEqual(['protobase_archive_3'])
      expect(await sql`select id from protobase_archive_3.member`).toEqual([{ id: 'm1' }])
      expect(await keysInto(sql, 'protobase_archive_3')).toEqual([])
      expect(await sql`select active_organization_id_archive as kept from auth.session`).toEqual([{ kept: 'main' }])

      // The app's role is refused the schema, and its tables even with the schema granted again.
      await expect(asApp((tx) => tx`select from protobase_archive_3.member`)).rejects.toThrow('permission denied for schema protobase_archive_3')
      await sql.unsafe(`grant usage on schema protobase_archive_3 to ${app}`)
      await expect(asApp((tx) => tx`select from protobase_archive_3.member`)).rejects.toThrow('permission denied for table member')
      await expect(asApp((tx) => tx`select id from protobase_archive_3.member`)).rejects.toThrow('permission denied for table member')
      await sql.unsafe(`revoke usage on schema protobase_archive_3 from ${app}`)
      expect(await asApp((tx) => tx`select id from auth.session`)).toEqual([{ id: 's1' }])

      // Delete refuses while the watch counted a write of the column's archive within its period.
      const contractId = await idOf(contract)
      await writeDelete({ ...run, hours: 168, module: 'organizations' })
      await sql`update auth.session set active_organization_id_archive = 'other'`
      await appliedAgo(contractId, 200, false)
      await expect(migrate()).rejects.toThrow('organizations was written within the last 168 hours, which retired.writes counts: auth.session.active_organization_id 1')
      expect(await schemaOf(sql, 'member')).toEqual(['protobase_archive_3'])

      // Once the write is older than the period, it drops the archive, the column's archive and the module's steps.
      await sql`update retired.writes set hour = hour - interval '200 hours'`
      await migrate()
      expect(await schemaOf(sql, 'member')).toEqual([])
      expect(await sql`select from pg_namespace where nspname = 'protobase_archive_3'`).toHaveLength(0)
      expect(await sql`select from information_schema.columns where table_name = 'session' and column_name like 'active_organization_id%'`).toHaveLength(0)
      expect(await sql`select from auth.auth_steps where module = 'organizations' or target = 'organizations'`).toHaveLength(0)
    } finally {
      await sql.end()
    }
  })

  it('turns an archived module on again as fresh empty tables, the archive still there and still refused', async () => {
    const { sql, migration, migrate, run, idOf, appliedAgo, asApp } = await project()
    try {
      const offId = await idOf((await migration({ auth: organizationsOff, off: 'archive' }))!)
      await migrate()
      await writeContract({ ...run, hours: 24 })
      await appliedAgo(offId, 25)
      await migrate()
      await sql`delete from auth."user"`

      await migration({})
      await migrate()
      expect((await schemaOf(sql, 'member')).sort()).toEqual(['auth', 'protobase_archive_3'])
      expect(await sql`select from auth.member`).toHaveLength(0)
      expect(await sql`select id from protobase_archive_3.member`).toEqual([{ id: 'm1' }])
      expect(await sql`select column_name from information_schema.columns where table_name = 'session' and column_name like 'active_organization_id%' order by 1`).toEqual([
        { column_name: 'active_organization_id' },
        { column_name: 'active_organization_id_archive' },
      ])
      await expect(asApp((tx) => tx`select from protobase_archive_3.member`)).rejects.toThrow('permission denied for schema protobase_archive_3')
    } finally {
      await sql.end()
    }
  })

  it("keeps a token's organization through the archive, and points it at the new organizations once on again", async () => {
    const both = authOf({ organizations: { enabled: true }, personalAccessTokens: { prefix: 'app_' } }, true)
    const { sql, migration, migrate, run, idOf, appliedAgo } = await project(both)
    const tokenKeys = () => sql`select confrelid::regclass::text as target from pg_constraint where conrelid = 'auth.personal_access_token'::regclass and contype = 'f' and conkey = array[(select attnum from pg_attribute where attrelid = 'auth.personal_access_token'::regclass and attname = 'organization_id')]`
    try {
      const offId = await idOf((await migration({ auth: { ...authOf({ personalAccessTokens: { prefix: 'app_' } }), organizations: testOrganizations }, off: 'archive' }))!)
      await migrate()
      await writeContract({ ...run, hours: 24 })
      await appliedAgo(offId, 25)
      await migrate()
      expect(await tokenKeys()).toEqual([])
      expect(await sql`select is_nullable from information_schema.columns where table_name = 'personal_access_token' and column_name = 'organization_id'`).toEqual([{ is_nullable: 'NO' }])

      await migration({})
      await migrate()
      expect(await tokenKeys()).toEqual([{ target: 'auth.organization' }])
      expect(await schemaOf(sql, 'organization')).toEqual(expect.arrayContaining(['auth', 'protobase_archive_3']))
    } finally {
      await sql.end()
    }
  })
})
