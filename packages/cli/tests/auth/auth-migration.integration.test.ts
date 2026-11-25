import { randomBytes } from 'node:crypto'
import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { getMigrations } from 'better-auth/db/migration'
import pg from 'pg'
import postgres from 'postgres'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { Kysely, PostgresDialect } from 'kysely'
import { f, resource } from '@protobase/schema'
import { authSchemaDrift, authSchemaMigration, checkMigrationRecord, checkResourcesOutsideAuthStore, createOrganization, createUser, unauthorized, type AdminAuth } from '@protobase/server'
import { buildAuth, createAuth, legacyVersions, organizationsInput, plainStoreDb, runtimeModel, stepsOfVersions, storeNames } from '@protobase/server/internal'
import { checkMigrations } from '../../src/migration/snapshot/check'
import { readSnapshot } from '../../src/migration/snapshot/snapshot-file'
import { migrationText } from '../../src/auth/migration-file'
import { textBeforeRecord } from '../../src/migration/record/record-block'
import { protobaseVersion } from '../../src/version/version'
import { writeAuthMigration } from '../../src/auth/write-migration'
import { startServe } from '../../src/serve/lifecycle'
import { servedConfig } from '../support/served-config'
import { root, run, typescriptArgs } from '../support/auth-project'
import { databaseReachable, testDatabaseUrl } from '../support/database'
import { withDatabase } from '../support/serve-process'

// afterAll drops every database the tests made, one at a time, and a loaded Postgres takes seconds for some drops.
vi.setConfig({ hookTimeout: 30_000 })

const url = testDatabaseUrl()
const reachable = await databaseReachable(url)
const secret = 'integration-test-secret-integration-test'

const maintenance = () => postgres(withDatabase(url, 'postgres'), { max: 1, onnotice: () => {} })

// Each test gets a database of its own, dropped afterwards.
const databases: string[] = []
const createDatabase = async () => {
  const name = `protobase_auth_migration_${randomBytes(4).toString('hex')}`
  const sql = maintenance()
  await sql.unsafe(`create database ${name}`)
  await sql.end()
  databases.push(name)
  return withDatabase(url, name)
}

// The same store as `authOn`'s, as a served config's `auth` describes it: in the database's search path, without mail or providers.
const storeAuth = { schema: 'public', mailer: false, operator: false, signInProviders: [] } as const

const pools: pg.Pool[] = []
const authOn = (databaseUrl: string, options: pg.PoolConfig = {}) => {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 2, ...options })
  pools.push(pool)
  return createAuth({ database: pool, baseURL: 'http://localhost:1', secret, mailer: false, operator: false, signInProviders: [] })
}

// Applies the migration files of `dir` the way a project's migrate step does: all in one transaction.
const applyAll = async (databaseUrl: string, dir: string) => {
  const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} })
  await sql.begin(async (tx) => {
    for (const file of (await readdir(dir)).sort()) await tx.unsafe(await readFile(path.join(dir, file), 'utf8'))
  })
  await sql.end()
}

afterEach(async () => {
  await Promise.all(pools.splice(0).map((pool) => pool.end()))
})

afterAll(async () => {
  const sql = maintenance()
  for (const name of databases) await sql.unsafe(`drop database if exists ${name} with (force)`)
  await sql.end()
})

describe.skipIf(!reachable)('auth schema changes as migrations of the project', () => {
  let dir: string
  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'protobase-auth-migrations-'))
  })
  afterAll(() => rm(dir, { recursive: true, force: true }))

  // Each test's project, whose snapshot the written file starts, holds its migrations in db/migrations.
  const migrationsDir = async () => {
    const folder = path.join(dir, randomBytes(4).toString('hex'), 'db', 'migrations')
    await mkdir(folder, { recursive: true })
    return folder
  }
  const projectOf = (folder: string) => path.dirname(path.dirname(folder))
  // The file without its header and its record block, whose id is its own.
  const withoutHeader = (text: string) => textBeforeRecord(text).replace(/^(-- protobase:.*\n)+/, '')
  // The server's startup check of the record of migrations.
  const checkRecord = (auth: AdminAuth) => checkMigrationRecord(plainStoreDb(auth), runtimeModel(auth, {}), protobaseVersion)
  const query = async <Row extends object>(databaseUrl: string, text: string) => {
    const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} })
    const rows = await sql.unsafe<Row[]>(text)
    await sql.end()
    return [...rows]
  }
  // Each part of a step the store recorded, as `module step` or `module step on target`, sorted.
  const label = ({ module, step, target }: { module: string; step: number; target: string }) => `${module} ${step}${target === module ? '' : ` on ${target}`}`
  const versions = async (databaseUrl: string, table = 'auth_steps') => (await query<{ module: string; step: number; target: string }>(databaseUrl, `select module, step, target from ${table}`)).map(label).sort()
  // Every part of every step of the modules `auth` has on, by the versions of the steps this Protobase ships.
  const everyOf = (auth: AdminAuth) => {
    const on = storeNames(auth).names.modules
    return stepsOfVersions(legacyVersions.map(({ version }) => version))
      .filter(({ module, target }) => on.includes(module) && on.includes(target))
      .map(label)
      .sort()
  }
  // Every feature that keeps something in the store: organizations, the OAuth provider for MCP, personal access tokens
  // and the From addresses of personal mail.
  const personalMail = { personalMail: ['gmail' as const], encryptOAuthTokens: true, socialProviders: { google: { clientId: 'client-1.apps.googleusercontent.com', clientSecret: 'client-secret' } } }
  const allOn = { organizations: { default: { id: 'default', name: 'Default', slug: 'default' }, create: 'everyone' as const }, mcp: true as const, personalAccessTokens: { prefix: 'test_' }, ...personalMail }
  // An auth with `features` on, over a database of its own.
  const authWith = async (databaseUrl: string, features: Partial<typeof allOn>) => {
    const auth = await buildAuth({ database: new pg.Pool({ connectionString: databaseUrl, max: 2 }), baseURL: 'http://localhost:1', secret, mailer: false, operator: false, signInProviders: [], ...features })
    pools.push(auth.options.database as pg.Pool)
    return auth
  }

  it('writes every migration into a fresh database and records them, then nothing once that is applied', async () => {
    const databaseUrl = await createDatabase()
    const auth = await authWith(databaseUrl, allOn)
    const folder = await migrationsDir()
    await expect(checkRecord(auth)).rejects.toThrow(/^The database has no migration recorded in migrations\.history.*`protobase migrate`/)

    const file = await writeAuthMigration({ auth, projectDir: projectOf(folder), dir: folder, name: 'auth' })
    expect(path.basename(file!)).toBe('001_auth.sql')
    const text = await readFile(file!, 'utf8')
    expect(text).toContain('create table if not exists "auth_steps"')
    expect(textBeforeRecord(text)).not.toContain('auth_migrations')
    expect(text).toContain('create table if not exists "user"')
    expect(text).toContain('"platform_sign_in" text not null')
    expect(text).toContain('-- mcp 1 mcp: ')

    await applyAll(databaseUrl, folder)
    await expect(checkRecord(auth)).resolves.toBeUndefined()
    expect(await versions(databaseUrl)).toEqual(everyOf(auth))
    expect(await writeAuthMigration({ auth, projectDir: projectOf(folder), dir: folder, name: 'auth' })).toBeUndefined()
    expect(await readdir(folder)).toEqual(['001_auth.sql'])
    // The file starts the project's snapshot, at every step, so `protobase migration` goes on from it.
    expect(await readSnapshot(projectOf(folder))).toMatchObject({ endsAt: { file: '001_auth.sql' } })
    expect(await checkMigrations(projectOf(folder), folder, { names: storeNames(auth), organizationsOn: true, organizations: organizationsInput(auth.organizations?.options) }, {})).toEqual([])
  })

  it('starts the snapshot of a project whose auth migrations came before it with a file without statements', async () => {
    const databaseUrl = await createDatabase()
    const auth = authOn(databaseUrl)
    const folder = await migrationsDir()
    // The project's auth migration as an earlier Protobase wrote it, without Protobase's lines or a snapshot.
    await writeFile(path.join(folder, '001_auth.sql'), migrationText((await authSchemaMigration(auth))!))
    await applyAll(databaseUrl, folder)
    expect(await checkMigrations(projectOf(folder), folder, { names: storeNames(auth), organizationsOn: false, organizations: undefined }, {})).toEqual([
      "the project has auth migrations from before protobase.snapshot.json: start it with `protobase migration baseline`, against the database with the project's migrations applied",
    ])

    const file = await writeAuthMigration({ auth, projectDir: projectOf(folder), dir: folder, name: 'auth' })
    expect(path.basename(file!)).toBe('002_auth.sql')
    const text = await readFile(file!, 'utf8')
    expect(withoutHeader(text)).not.toMatch(/^[^-\n]/m)
    await query(databaseUrl, text)
    expect(await versions(databaseUrl)).toEqual(everyOf(auth))
    expect(await readSnapshot(projectOf(folder))).toMatchObject({ endsAt: { file: '002_auth.sql' } })
    expect(await checkMigrations(projectOf(folder), folder, { names: storeNames(auth), organizationsOn: false, organizations: undefined }, {})).toEqual([])
    expect(await writeAuthMigration({ auth, projectDir: projectOf(folder), dir: folder, name: 'auth' })).toBeUndefined()
  })

  it('writes the tables of the features the app turns on, and only those', async () => {
    const featureSets = [{}, { organizations: allOn.organizations }, { mcp: allOn.mcp }, { personalAccessTokens: allOn.personalAccessTokens }, personalMail, allOn]
    const written = new Map<string, string>()
    for (const features of featureSets) {
      const databaseUrl = await createDatabase()
      const auth = await buildAuth({ database: new pg.Pool({ connectionString: databaseUrl, max: 2 }), baseURL: 'http://localhost:1', secret, mailer: false, operator: false, signInProviders: [], ...features })
      pools.push(auth.options.database as pg.Pool)
      const folder = await migrationsDir()
      const text = withoutHeader(await readFile((await writeAuthMigration({ auth, projectDir: projectOf(folder), dir: folder, name: 'auth' }))!, 'utf8'))
      written.set(Object.keys(features).join(',') || 'none', text)
      await applyAll(databaseUrl, folder)
      await expect(checkRecord(auth)).resolves.toBeUndefined()
      expect(await authSchemaDrift(auth)).toEqual([])
    }
    const none = written.get('none')!
    for (const module of ['organizations', 'mcp', 'personal_access_tokens', 'mail_senders']) expect(none).not.toContain(`-- ${module} 1 `)
    expect(none).not.toContain('last_organization_id')
    expect(written.get('organizations')).toContain('-- organizations 1 organizations, on the tables of auth:')
    expect(written.get('organizations')).not.toContain('personal_access_token')
    expect(written.get('mcp')).toContain('-- mcp 1 mcp:')
    expect(written.get('personalAccessTokens')).toContain('-- personal_access_tokens 1 ')
    expect(written.get('personalMail,encryptOAuthTokens,socialProviders')).toContain('-- mail_senders 5 ')
    expect(written.get(Object.keys(allOn).join(','))).toContain('-- organizations 1 organizations, on the tables of personal_access_tokens:')
  })

  it("names the store's schema, user table, user columns and id type as the app configures them", async () => {
    const databaseUrl = await createDatabase()
    await query(databaseUrl, 'create schema auth')
    const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 })
    pools.push(pool)
    const options = {
      database: { dialect: new PostgresDialect({ pool }), type: 'postgres' as const, schemaName: 'auth' },
      baseURL: 'http://localhost:1',
      secret,
      mailer: false as const,
      operator: false as const,
      signInProviders: [] as const,
      tables: { user: { name: 'people', columns: { email: 'address', two_factor_enabled: 'mfa', last_organization_id: 'last_org' } } },
      users: { metadata: 'meta' },
      generateUserId: 'uuid' as const,
      // Its ids are uuids, the default organization's too.
      organizations: { ...allOn.organizations, default: { id: '00000000-0000-4000-8000-000000000000', name: 'Default', slug: 'default' } },
    }
    const auth = createAuth(options)
    const folder = await migrationsDir()
    const text = await readFile((await writeAuthMigration({ auth, projectDir: projectOf(folder), dir: folder, name: 'auth' }))!, 'utf8')
    expect(text).toContain('create table if not exists "auth"."people" (id uuid default pg_catalog.gen_random_uuid() primary key)')
    expect(text).toContain('references "auth"."people" (id)')
    await applyAll(databaseUrl, folder)

    await expect(checkRecord(auth)).resolves.toBeUndefined()
    expect(await versions(databaseUrl, 'auth.auth_steps')).toEqual(everyOf(auth))
    expect(await authSchemaDrift(await buildAuth(options))).toEqual([])
    const columns = await query<{ name: string }>(
      databaseUrl,
      `select table_name || '.' || column_name || ' ' || udt_name as name from information_schema.columns where table_schema = 'auth' and (table_name = 'people' and column_name in ('address', 'mfa', 'last_org', 'meta') or table_name = 'session' and column_name = 'user_id') order by 1`,
    )
    expect(columns.map((row) => row.name)).toEqual(['people.address text', 'people.last_org text', 'people.meta jsonb', 'people.mfa bool', 'session.user_id uuid'])
    const made = await createUser(auth, { email: 'root@example.com', password: 'a-long-test-password' })
    expect(made.id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('writes the steps of a feature turned on later, and a user made with it off works with it on', async () => {
    const databaseUrl = await createDatabase()
    const off = authOn(databaseUrl)
    const folder = await migrationsDir()
    await writeAuthMigration({ auth: off, projectDir: projectOf(folder), dir: folder, name: 'auth' })
    await applyAll(databaseUrl, folder)
    await createUser(off, { email: 'root@example.com', password: 'a-long-test-password' })
    expect(await query(databaseUrl, "select to_regclass('member') as found")).toEqual([{ found: null }])

    const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 })
    pools.push(pool)
    // Root, there already, becomes a member of the default organization with the role the config names.
    const organizations = { ...allOn.organizations, existingUsersRole: 'sales' }
    const on = await buildAuth({ database: pool, baseURL: 'http://localhost:1', secret, mailer: false, operator: false, signInProviders: [], roles: { sales: 'Sales' }, ...allOn, organizations })
    await expect(checkRecord(on)).rejects.toThrow(/so the server will not start/)
    const text = await readFile((await writeAuthMigration({ auth: on, projectDir: projectOf(folder), dir: folder, name: 'auth' }))!, 'utf8')
    expect(text).toContain('-- organizations 1 organizations: ')
    expect(text).toContain('-- organizations 1 organizations, on the tables of auth: ')
    expect(text).not.toContain('-- auth 1 core')
    await query(databaseUrl, text)
    await expect(checkRecord(on)).resolves.toBeUndefined()
    expect(await authSchemaDrift(on)).toEqual([])
    expect(await query(databaseUrl, 'select last_organization_id from "user"')).toEqual([{ last_organization_id: null }])
    await createOrganization(on, { name: 'Acme', slug: 'acme', owner: 'root@example.com' })
    expect(await query(databaseUrl, 'select o.slug, m.role, m.app_roles from member m join organization o on o.id = m.organization_id order by o.slug')).toEqual([
      { slug: 'acme', role: 'owner', app_roles: ['sales'] },
      { slug: 'default', role: 'member', app_roles: ['sales'] },
    ])
  })

  it('writes only the migrations the store has not applied, as the next file', async () => {
    const databaseUrl = await createDatabase()
    const auth = authOn(databaseUrl)
    const folder = await migrationsDir()
    await writeAuthMigration({ auth, projectDir: projectOf(folder), dir: folder, name: 'auth' })
    await applyAll(databaseUrl, folder)
    // The store as a version of Protobase before the last migration left it.
    await query(databaseUrl, `drop table passkey; delete from auth_steps where module = 'passkeys'`)

    const file = await writeAuthMigration({ auth, projectDir: projectOf(folder), dir: folder, name: 'auth' })
    expect(path.basename(file!)).toBe('002_auth.sql')
    const text = await readFile(file!, 'utf8')
    expect(text).not.toContain('create table if not exists "user"')
    expect(text).not.toContain('create table if not exists "auth_steps"')
    expect(text).toContain('-- passkeys 1 passkeys: ')
    const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} })
    await sql.begin((tx) => tx.unsafe(text))
    await sql.end()
    await expect(checkRecord(auth)).resolves.toBeUndefined()
    expect(await versions(databaseUrl)).toEqual(everyOf(auth))
  })

  it('refuses a step whose check fails before it changes anything, naming the rows to fix by hand', async () => {
    const databaseUrl = await createDatabase()
    const auth = authOn(databaseUrl)
    const folder = await migrationsDir()
    await writeAuthMigration({ auth, projectDir: projectOf(folder), dir: folder, name: 'auth' })
    await applyAll(databaseUrl, folder)
    // The store before the step that makes one account per provider and account id, with one such account twice.
    await query(
      databaseUrl,
      `drop table refused_account, device_session; drop index account_provider_id_account_id_uidx, account_provider_id_single_subject_user_id_uidx; alter table account drop column single_subject_user_id; delete from auth_steps where module = 'auth' and step = 2 or module = 'platform_devices'`,
    )
    await query(databaseUrl, `insert into "user" (id, name, email, email_verified) values ('u1', 'Root', 'root@example.com', true)`)
    await query(databaseUrl, `insert into account (id, account_id, provider_id, user_id, updated_at) values ('a1', 's1', 'idp', 'u1', now()), ('a2', 's1', 'idp', 'u1', now())`)

    const text = await readFile((await writeAuthMigration({ auth, projectDir: projectOf(folder), dir: folder, name: 'auth' }))!, 'utf8')
    expect(text).toContain('-- auth 2 account_keys: ')
    const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} })
    await expect(sql.begin((tx) => tx.unsafe(text))).rejects.toThrow(/more than one account for a provider and account id: idp s1 \(accounts a1, a2\)\. Keep one of each in a migration of the project's own written before this one/)
    await sql.end()
    expect(await versions(databaseUrl)).toEqual(everyOf(auth).filter((part) => part !== 'auth 2' && !part.startsWith('platform_devices')))
  })

  it("puts each From address entered before on its owner's one Gmail connection, and on none when they have none or several", async () => {
    const databaseUrl = await createDatabase()
    const auth = await authWith(databaseUrl, personalMail)
    const folder = await migrationsDir()
    await writeAuthMigration({ auth, projectDir: projectOf(folder), dir: folder, name: 'auth' })
    await applyAll(databaseUrl, folder)
    // The store before the step that puts each From address on a connection, with the one key per person and address.
    await query(
      databaseUrl,
      `drop index mail_sender_connection_address_uidx, mail_sender_user_address_idx;
alter table mail_sender drop column connection_id, drop column address_key, drop column typed_at, drop column listed_at, drop column provider_state, drop column provider_state_read_at, drop column removed_at;
alter table mail_sender add unique (user_id, address);
delete from auth_steps where module = 'mail_senders' and step = 3`,
    )
    const send = 'https://www.googleapis.com/auth/gmail.send'
    await query(databaseUrl, `insert into "user" (id, name, email, email_verified) values ('one', 'One', 'one@example.com', true), ('none', 'None', 'none@example.com', true), ('two', 'Two', 'two@example.com', true), ('signin', 'Sign-in', 'signin@example.com', true)`)
    await query(
      databaseUrl,
      `insert into account (id, account_id, provider_id, user_id, scope, updated_at) values
  ('one-gmail', 's1', 'google', 'one', 'openid,email,${send}', now()),
  ('two-a', 's2', 'google', 'two', '${send}', now()),
  ('two-b', 's3', 'google', 'two', 'openid ${send}', now()),
  ('signin-google', 's4', 'google', 'signin', 'openid,email,profile', now())`,
    )
    await query(
      databaseUrl,
      `insert into mail_sender (id, user_id, address, name, shared, signature, is_default, created_at) values
  ('m1', 'one', 'billing@acme.example', 'Acme billing', false, null, true, '2026-10-01'),
  ('m2', 'one', 'sales@acme.example', null, false, 'Bye', false, '2026-10-02'),
  ('m3', 'none', 'none@acme.example', null, false, null, false, '2026-10-03'),
  ('m4', 'two', 'two@acme.example', null, false, null, false, '2026-10-04'),
  ('m5', 'signin', 'signin@acme.example', null, false, null, false, '2026-10-05')`,
    )

    const text = await readFile((await writeAuthMigration({ auth, projectDir: projectOf(folder), dir: folder, name: 'auth' }))!, 'utf8')
    expect(text).toContain('-- mail_senders 3 sender_address_evidence: ')
    const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} })
    await sql.begin((tx) => tx.unsafe(text))
    await sql.end()
    await expect(checkRecord(auth)).resolves.toBeUndefined()

    const rows = await query<{ id: string; connection_id: string | null; address_key: string; name: string | null; signature: string | null; is_default: boolean; typed_at: Date; listed_at: Date | null; provider_state: string | null }>(
      databaseUrl,
      `select id, connection_id, address_key, name, signature, is_default, typed_at, listed_at, provider_state from mail_sender order by id`,
    )
    expect(rows).toEqual([
      { id: 'm1', connection_id: 'one-gmail', address_key: 'billing@acme.example', name: 'Acme billing', signature: null, is_default: true, typed_at: new Date('2026-10-01'), listed_at: null, provider_state: null },
      { id: 'm2', connection_id: 'one-gmail', address_key: 'sales@acme.example', name: null, signature: 'Bye', is_default: false, typed_at: new Date('2026-10-02'), listed_at: null, provider_state: null },
      { id: 'm3', connection_id: null, address_key: 'none@acme.example', name: null, signature: null, is_default: false, typed_at: new Date('2026-10-03'), listed_at: null, provider_state: null },
      { id: 'm4', connection_id: null, address_key: 'two@acme.example', name: null, signature: null, is_default: false, typed_at: new Date('2026-10-04'), listed_at: null, provider_state: null },
      { id: 'm5', connection_id: null, address_key: 'signin@acme.example', name: null, signature: null, is_default: false, typed_at: new Date('2026-10-05'), listed_at: null, provider_state: null },
    ])
    // One address per connection now, not per person: the old key is gone, so one person may have it on two connections.
    await query(databaseUrl, `insert into mail_sender (id, user_id, connection_id, address, shared, is_default, created_at) values ('m6', 'two', 'two-a', 'two@acme.example', false, false, now()), ('m7', 'two', 'two-b', 'two@acme.example', false, false, now())`)
    await expect(query(databaseUrl, `insert into mail_sender (id, user_id, connection_id, address, shared, is_default, created_at) values ('m8', 'two', 'two-a', ' TWO@acme.example', false, false, now())`)).rejects.toThrow(/mail_sender_connection_address_uidx/)
  })

  // A store an earlier Protobase made by comparing its tables with Better Auth's: organizations on, MCP off, a user in it.
  const earlierStore = async () => {
    const databaseUrl = await createDatabase()
    const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 })
    pools.push(pool)
    const options = { database: pool, baseURL: 'http://localhost:1', secret, mailer: false as const, operator: false as const, signInProviders: [] as const, organizations: allOn.organizations }
    await (await getMigrations(createAuth(options).options)).runMigrations()
    await query(databaseUrl, `insert into "user" (id, name, email, email_verified) values ('u1', 'Root', 'root@example.com', true)`)
    return { databaseUrl, auth: createAuth(options) }
  }

  it('adopts a store an earlier Protobase made, once: the migrations it matches are recorded, the others applied', async () => {
    const { databaseUrl, auth } = await earlierStore()
    await expect(checkRecord(auth)).rejects.toThrow(/no migration recorded/)
    const folder = await migrationsDir()
    const text = await readFile((await writeAuthMigration({ auth, projectDir: projectOf(folder), dir: folder, name: 'auth' }))!, 'utf8')
    expect(text).toContain('adopted: 1 core, 2 two_factor, 3 passkeys, 4 sign_in_policy, 5 staff_sign_in, 6 organizations')
    expect(text).not.toContain('create table if not exists "user"')
    // MCP is off, so its tables stay out.
    expect(text).not.toContain('-- mcp 1 mcp: ')
    expect(text).toContain('-- platform_devices 1 platform_devices: ')

    await applyAll(databaseUrl, folder)
    await expect(checkRecord(auth)).resolves.toBeUndefined()
    expect(await versions(databaseUrl)).toEqual(everyOf(auth))
    expect(await query(databaseUrl, 'select email from "user"')).toEqual([{ email: 'root@example.com' }])
    expect(await writeAuthMigration({ auth, projectDir: projectOf(folder), dir: folder, name: 'auth' })).toBeUndefined()

    // Written from this store, the file stops on a database whose store lacks a table it adopts, changing nothing.
    const other = await earlierStore()
    await query(other.databaseUrl, 'drop table passkey')
    await expect(applyAll(other.databaseUrl, folder)).rejects.toThrow(/does not match the migrations this file adopts: it lacks passkey\.aaguid, passkey\.backed_up, /)
    expect(await query(other.databaseUrl, "select to_regclass('auth_steps') as found")).toEqual([{ found: null }])
  })

  it('refuses to adopt a store that matches no version, naming what differs', async () => {
    const { databaseUrl, auth } = await earlierStore()
    await query(databaseUrl, 'alter table passkey drop column rp_id; alter table jwks alter column alg type integer using null')
    const folder = await migrationsDir()
    await expect(writeAuthMigration({ auth, projectDir: projectOf(folder), dir: folder, name: 'auth' })).rejects.toThrow(
      /matches none of its migrations' versions: 1 core has jwks\.alg as int4, not text; 3 passkeys lacks passkey\.rp_id\. Bring it to the schema of Protobase 0\.47 first/,
    )
    expect(await readdir(folder)).toEqual([])
    expect(await query(databaseUrl, "select nspname from pg_namespace where nspname = 'protobase_auth_adoption'")).toEqual([])
  })

  it('refuses a store a newer Protobase migrated', async () => {
    const databaseUrl = await createDatabase()
    const auth = authOn(databaseUrl)
    const folder = await migrationsDir()
    await writeAuthMigration({ auth, projectDir: projectOf(folder), dir: folder, name: 'auth' })
    await applyAll(databaseUrl, folder)
    await query(databaseUrl, "insert into auth_steps (module, step, target) values ('auth', 99, 'auth')")
    await expect(writeAuthMigration({ auth, projectDir: projectOf(folder), dir: folder, name: 'auth' })).rejects.toThrow("The auth store records step 99 of auth, which this version of Protobase does not ship; upgrade Protobase")
  })

  it('compares the tables only in the development check, which names what drifted', async () => {
    const databaseUrl = await createDatabase()
    const auth = authOn(databaseUrl)
    const folder = await migrationsDir()
    await writeAuthMigration({ auth, projectDir: projectOf(folder), dir: folder, name: 'auth' })
    await applyAll(databaseUrl, folder)
    await query(databaseUrl, 'alter table passkey drop column rp_id')
    await expect(checkRecord(auth)).resolves.toBeUndefined()
    expect(await authSchemaDrift(auth)).toEqual(['lacks the column passkey.rp_id'])
  })

  it('checks without writing: it works on a read-only connection', async () => {
    const databaseUrl = await createDatabase()
    const folder = await migrationsDir()
    await writeAuthMigration({ auth: authOn(databaseUrl), projectDir: projectOf(folder), dir: folder, name: 'auth' })
    await applyAll(databaseUrl, folder)
    const readOnly = authOn(databaseUrl, { options: '-c default_transaction_read_only=on' })
    await expect(checkRecord(readOnly)).resolves.toBeUndefined()
  })

  it('keeps protobase serve from starting while the store is behind', async () => {
    const databaseUrl = await createDatabase()
    const config = servedConfig({ url: 'http://localhost:1', secret, auth: storeAuth, authenticate: () => Promise.reject(unauthorized('no')) })
    await expect(startServe({ config, env: { port: 0, databaseUrl, requestLog: false, filesCleanupMinutes: 0, runJobs: true, startupChecks: true, trustedProxies: [] } })).rejects.toThrow(/^The database has no migration recorded in migrations\.history/)
  })
})

// The routes that read tables, the API, the Supabase-compatible endpoints, realtime and MCP, read the app's resources
// only, so the store is kept from all of them by refusing a resource over any of its tables.
describe.skipIf(!reachable)('the auth store and the app\'s resources', () => {
  const over = (table: string) => resource(table.replace('.', '_')).table(table).fields({ id: f.text() }).primaryKey((r) => r.id).toModel()
  // A migrated store in `schemaName`, or the search path, and the app's own table `orders`.
  const migrated = async ({ schemaName, userTable }: { schemaName?: string; userTable?: string } = {}) => {
    const databaseUrl = await createDatabase()
    const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 })
    pools.push(pool)
    if (schemaName) await pool.query(`create schema if not exists ${schemaName}`)
    const database = schemaName ? { dialect: new PostgresDialect({ pool }), type: 'postgres' as const, schemaName } : pool
    const auth = createAuth({ database, baseURL: 'http://localhost:1', secret, mailer: false, operator: false, signInProviders: [], ...(userTable && { tables: { user: { name: userTable } } }) })
    // Written as `protobase auth migration` writes it, so the record of migrations has the store too.
    const project = await mkdtemp(path.join(tmpdir(), 'protobase-auth-store-'))
    const file = await writeAuthMigration({ auth, projectDir: project, dir: path.join(project, 'db/migrations'), name: 'auth' })
    await pool.query(await readFile(file!, 'utf8'))
    await rm(project, { recursive: true, force: true })
    await pool.query('create table orders (id text primary key)')
    const db = new Kysely<any>({ dialect: new PostgresDialect({ pool }) })
    return { databaseUrl, auth, db }
  }

  it('refuses a resource over any table of a store in the search path, and takes the app\'s own', async () => {
    const { auth, db } = await migrated({ userTable: 'people' })
    await expect(checkResourcesOutsideAuthStore(db, [over('orders')], auth)).resolves.toBeUndefined()
    for (const table of ['people', 'session', 'passkey', 'staff_sign_in', 'auth_steps', 'public.jwks']) {
      await expect(checkResourcesOutsideAuthStore(db, [over('orders'), over(table)], auth)).rejects.toThrow(/Resources over the auth store's tables, which hold password hashes, sessions and tokens: \w+ \(public\.\w+\)/)
    }
  })

  it('refuses a resource over a table of a store in its own schema, and takes a table of the same name elsewhere', async () => {
    const { auth, db } = await migrated({ schemaName: 'auth' })
    await db.schema.createTable('session').addColumn('id', 'text', (column) => column.primaryKey()).execute()
    await expect(checkResourcesOutsideAuthStore(db, [over('session'), over('public.session')], auth)).resolves.toBeUndefined()
    await expect(checkResourcesOutsideAuthStore(db, [over('auth.user')], auth)).rejects.toThrow('auth_user (auth.user)')
  })

  // A user view over another system's users, as on a Supabase database: the key table holds every password hash.
  it('refuses a resource over the key table under a user view, as over the view and the store', async () => {
    const databaseUrl = await createDatabase()
    const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 })
    pools.push(pool)
    await pool.query('create schema app_auth; create schema auth; create table auth.users (id uuid primary key, email text, encrypted_password text)')
    const users = { keyTable: { schema: 'auth', table: 'users' } }
    const auth = createAuth({ database: { dialect: new PostgresDialect({ pool }), type: 'postgres', schemaName: 'app_auth' }, baseURL: 'http://localhost:1', secret, mailer: false, operator: false, signInProviders: [], generateUserId: 'uuid', tables: { user: { name: 'users' } }, users })
    await pool.query((await authSchemaMigration(auth))!)
    await pool.query('create view app_auth.users as select id, email from auth.users; create table orders (id text primary key)')
    const db = new Kysely<any>({ dialect: new PostgresDialect({ pool }) })
    await expect(checkResourcesOutsideAuthStore(db, [over('orders')], auth)).resolves.toBeUndefined()
    for (const table of ['auth.users', 'app_auth.users', 'app_auth.account']) {
      await expect(checkResourcesOutsideAuthStore(db, [over('orders'), over(table)], auth)).rejects.toThrow(`${table.replace('.', '_')} (${table})`)
    }
  })

  it('keeps protobase serve from starting with a resource over the store', async () => {
    // In the schema the served config names, so the record of migrations has the store the server reads.
    const { databaseUrl } = await migrated({ schemaName: 'public' })
    const session = resource('session').table('session').fields({ id: f.text() }).primaryKey((r) => r.id)
    const config = servedConfig({ config: { session }, url: 'http://localhost:1', secret, auth: storeAuth, authenticate: () => Promise.reject(unauthorized('no')) })
    await expect(startServe({ config, env: { port: 0, databaseUrl, requestLog: false, filesCleanupMinutes: 0, runJobs: true, startupChecks: true, trustedProxies: [] } })).rejects.toThrow(/Resources over the auth store's tables.*session \(public\.session\)/)
  })
})

// The migrate step of the examples and presets, copied into a project of its own with migrations the test writes.
describe.skipIf(!reachable)("a project's migrate step", () => {
  const scratchDir = path.join(root, 'tests/apps/scratch')
  let projectDir: string

  beforeAll(async () => {
    // Inside the scratch example, so the script resolves the same packages.
    projectDir = path.join(scratchDir, `.migrate-test-${randomBytes(4).toString('hex')}`)
    await mkdir(path.join(projectDir, 'db/migrations'), { recursive: true })
    for (const file of ['migrate.ts', 'connection.ts']) await cp(path.join(scratchDir, 'db', file), path.join(projectDir, 'db', file))
  })
  afterAll(() => rm(projectDir, { recursive: true, force: true }))

  const migrations = async (files: Record<string, string>) => {
    const dir = path.join(projectDir, 'db/migrations')
    await rm(dir, { recursive: true, force: true })
    await mkdir(dir)
    for (const [name, text] of Object.entries(files)) await writeFile(path.join(dir, name), text)
  }
  const migrate = (databaseUrl: string) => run(typescriptArgs(path.join(projectDir, 'db/migrate.ts')), projectDir, { DATABASE_URL: databaseUrl })
  const state = async (databaseUrl: string) => {
    const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} })
    // A failed first run rolls back the bookkeeping table too.
    const [found] = await sql<{ exists: boolean }[]>`select to_regclass('migrations.applied') is not null as exists`
    const applied = found!.exists ? (await sql`select name from migrations.applied order by name`).map((row) => row.name) : []
    const tables = (await sql`select table_name from information_schema.tables where table_schema = 'public' and table_name like 'shop_%' order by 1`).map((row) => row.table_name)
    await sql.end()
    return { applied, tables }
  }

  it('applies the pending migrations in one transaction: a failing one leaves the database as it was', async () => {
    const databaseUrl = await createDatabase()
    await migrations({ '001_shop.sql': 'create table shop_items (id int primary key);', '002_auth.sql': 'create table shop_broken (id int primary key, nope nonexistent_type);' })
    const failed = await migrate(databaseUrl)
    expect(failed.status).not.toBe(0)
    expect(await state(databaseUrl)).toEqual({ applied: [], tables: [] })

    await migrations({ '001_shop.sql': 'create table shop_items (id int primary key);', '002_auth.sql': 'create table shop_orders (id int primary key);' })
    const applied = await migrate(databaseUrl)
    expect(applied.stderr).toBe('')
    expect(applied.stdout).toBe('applied 001_shop.sql\napplied 002_auth.sql\n')
    expect(await state(databaseUrl)).toEqual({ applied: ['001_shop.sql', '002_auth.sql'], tables: ['shop_items', 'shop_orders'] })
    expect((await migrate(databaseUrl)).stdout).toBe('')
  }, 120_000)

  it('refuses a second run while one runs, so each migration is applied once', async () => {
    const databaseUrl = await createDatabase()
    await migrations({ '001_shop.sql': 'create table shop_items (id int primary key); select pg_sleep(3);' })
    const [first, second] = await Promise.all([migrate(databaseUrl), migrate(databaseUrl)])
    expect([first.status, second.status].sort()).toEqual([0, 1])
    expect(first.stdout + second.stdout).toBe('applied 001_shop.sql\n')
    expect(first.stderr + second.stderr).toContain('Another run of the migrations is applying them to this database')
    expect(await state(databaseUrl)).toEqual({ applied: ['001_shop.sql'], tables: ['shop_items'] })
  }, 120_000)
})
