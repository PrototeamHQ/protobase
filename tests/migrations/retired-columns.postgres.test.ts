import { readFile } from 'node:fs/promises'
import postgres from 'postgres'
import { afterEach, describe, expect, it } from 'vitest'
import { applyMigrations } from '../../packages/cli/src/migration/apply-migrations'
import { trialContractions } from '../../packages/cli/src/migration/older-code/trial'
import { authOf, cleanProjects, counterIds, migrationsOf, newProject, testOrganizations } from '../../packages/cli/src/migration/snapshot/project-fixture'
import { runMigration, type MigrationRun } from '../../packages/cli/src/migration/snapshot/run-migration'
import { columnId, tableId } from '../../packages/server/src/better-auth/names/identifiers'
import { ddlText } from '../../packages/server/src/better-auth/store/ddl'
import { watchBaseStatements, watchTrigger } from '../../packages/server/src/better-auth/store/offline/retired-watch'
import { openPostgresDatabase, postgresTemplateReady } from '../../test-support/postgres-database'

// The columns a sign-in module adds to the tables still on, once it is off: kept under their names, watched for the
// writes of older code by hour, and in use again with their values once it is on again.

afterEach(cleanProjects)

const organizationsOn = authOf({ organizations: { enabled: true } }, true)
const organizationsOff = { ...authOf(), organizations: testOrganizations }

describe.skipIf(!(await postgresTemplateReady('empty')))('a retired column, on real Postgres', () => {
  it('counts the writes older code makes by hour, and comes back as the same column with its values', async () => {
    const database = await openPostgresDatabase('empty')
    const projectDir = await newProject()
    const dir = migrationsOf(projectDir)
    const sql = postgres(database.url, { max: 1, onnotice: () => {} })
    const migrate = async (force = false) => applyMigrations(sql, dir, () => {}, { force })
    const ids = counterIds()
    const migration = (run: Partial<MigrationRun>) =>
      runMigration({ projectDir, dir, auth: organizationsOn, modules: {}, protobaseVersion: '1.0.0', newId: ids, database: { url: database.url, parts: [], contractions: (sections) => trialContractions(database.url, sections), readModule: async () => undefined }, ...run })
    const attnum = async () => (await sql`select attnum from pg_attribute where attrelid = 'auth.session'::regclass and attname = 'active_organization_id'`)[0]!.attnum as number
    // Each bucket starts an hour from the one before the watched writes to the one of the read, both included: these
    // writes may cross an hour; the next test pins the exact hour of a write.
    let start = ''
    const writes = async () =>
      (await sql`select column_name, sum(writes)::int as writes, bool_and(hour = date_trunc('hour', hour) and hour >= date_trunc('hour', ${start}::timestamptz) and hour <= date_trunc('hour', clock_timestamp())) as hours from retired.writes group by 1 order by 1`).map((row) => ({ ...row }))
    try {
      await migration({ database: undefined })
      await migrate()
      await sql`insert into auth."user" (id, name, email, email_verified) values ('ana', 'Ana', 'ana@example.com', true), ('bo', 'Bo', 'bo@example.com', true)`
      await sql`insert into auth.member (id, organization_id, user_id, role, created_at) values ('m1', 'main', 'ana', 'sales', now()), ('m2', 'main', 'bo', 'sales', now())`
      await sql`insert into auth.session (id, expires_at, token, updated_at, user_id, active_organization_id) values ('b1', now() + interval '1 day', 'b1', now(), 'bo', 'main')`
      await sql`insert into auth.session (id, expires_at, token, updated_at, user_id, active_organization_id) values ('s1', now() + interval '1 day', 't1', now(), 'ana', 'main')`
      const before = await attnum()

      // Off: the file takes nothing from older code, which still sets the column, and each write it makes is counted.
      const off = (await migration({ auth: organizationsOff, off: 'keep' }))!
      const text = await readFile(off, 'utf8')
      expect(text).not.toContain('breaks-older-code')
      expect(text).toContain('create trigger "active_organization_id_retired_writes"')
      expect(await trialContractions(database.url, [{ name: 'auth', text }])).toEqual([])
      await migrate()
      start = (await sql`select clock_timestamp()::text as start`)[0]!.start as string
      await sql`insert into auth.session (id, expires_at, token, updated_at, user_id, active_organization_id) values ('s2', now() + interval '1 day', 't2', now(), 'ana', 'main')`
      await sql`update auth.session set active_organization_id = 'main' where id = 's1'`
      await sql`insert into auth.session (id, expires_at, token, updated_at, user_id) values ('s3', now() + interval '1 day', 't3', now(), 'ana')`
      await sql`update auth.session set expires_at = now() + interval '2 days'`
      expect(await writes()).toEqual([{ column_name: 'active_organization_id', writes: 2, hours: true }])

      // Erasing a user while off takes their sessions, retired columns and all, and the rows of the module kept, by the foreign keys.
      await sql`delete from auth."user" where id = 'bo'`
      expect((await sql`select (select count(*) from auth.session where user_id = 'bo')::int as sessions, (select count(*) from auth.member where user_id = 'bo')::int as members`)[0]).toEqual({ sessions: 0, members: 0 })

      // On again: the same column, with the values it kept, no longer watched.
      const on = (await migration({ force: true }))!
      expect(await readFile(on, 'utf8')).toContain('-- organizations on again: the columns it adds are in use again')
      expect(await readFile(on, 'utf8')).not.toContain('breaks-older-code')
      await migrate(true)
      expect(await attnum()).toBe(before)
      expect((await sql`select id, active_organization_id from auth.session order by id`).map((row) => ({ ...row }))).toEqual([
        { id: 's1', active_organization_id: 'main' },
        { id: 's2', active_organization_id: 'main' },
        { id: 's3', active_organization_id: null },
      ])
      expect(await sql`select tgname from pg_trigger where tgname like '%retired_writes'`).toHaveLength(0)
      await sql`update auth.session set active_organization_id = 'main' where id = 's3'`
      expect(await writes()).toEqual([{ column_name: 'active_organization_id', writes: 2, hours: true }])
    } finally {
      await sql.end()
    }
  })

  // Postgres cannot move a transaction's start or its clock, but `date_trunc` truncates in the session's TimeZone, so a
  // zone offset by whole minutes puts an hour boundary at the next minute: the test waits for it, up to a minute.
  it('counts a write in a transaction that crosses an hour in the hour of the write, not the one the transaction began', { timeout: 90_000 }, async () => {
    const database = await openPostgresDatabase('empty')
    const sql = postgres(database.url, { max: 1, onnotice: () => {} })
    const probe = tableId('public', 'probe')
    try {
      await sql`create table probe (id int primary key, watched text)`
      for (const statement of [...watchBaseStatements(), watchTrigger(probe, columnId(probe, 'watched'))]) await sql.unsafe(ddlText(statement))

      const tx = await sql.reserve()
      try {
        await tx`begin`
        // The next whole minute, and the zone east of UTC by the minutes that make it start a local hour.
        const { boundary, zone } = (await tx`select date_trunc('minute', now()) + interval '1 minute' as boundary, format('XXX-00:%s', lpad(((60 - extract(minute from date_trunc('minute', now()) + interval '1 minute')::int) % 60)::text, 2, '0')) as zone`)[0]!
        await tx`select set_config('TimeZone', ${zone}, true)`
        await tx`select pg_sleep(extract(epoch from ${boundary}::timestamptz - clock_timestamp()) + 0.2)`
        await tx`insert into probe (id, watched) values (1, 'set')`
        const counted = await tx`select hour = ${boundary}::timestamptz as exact, hour > now() as after_start, writes::int as writes from retired.writes`
        expect(counted.map((row) => ({ ...row }))).toEqual([{ exact: true, after_start: true, writes: 1 }])
        await tx`rollback`
      } finally {
        tx.release()
      }
    } finally {
      await sql.end()
    }
  })
})
