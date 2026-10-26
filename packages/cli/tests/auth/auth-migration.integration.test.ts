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
import { authSchemaDrift, authSchemaMigration, checkAuthSchema, checkResourcesOutsideAuthStore, createOrganization, createUser, unauthorized, type AdminAuth } from '@protobase/server'
import { createAuth } from '@protobase/server/internal'
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
const storeAuth = { schema: 'public', mailer: false, operator: false, signInProvider: false } as const

const pools: pg.Pool[] = []
const authOn = (databaseUrl: string, options: pg.PoolConfig = {}) => {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 2, ...options })
  pools.push(pool)
  return createAuth({ database: pool, baseURL: 'http://localhost:1', secret, mailer: false, operator: false, signInProvider: false })
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

  const migrationsDir = async () => {
    const folder = path.join(dir, randomBytes(4).toString('hex'))
    await mkdir(folder)
    return folder
  }
  const query = async <Row extends object>(databaseUrl: string, text: string) => {
    const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} })
    const rows = await sql.unsafe<Row[]>(text)
    await sql.end()
    return [...rows]
  }
  const versions = async (databaseUrl: string, table = 'auth_migrations') => (await query<{ version: number }>(databaseUrl, `select version from ${table} order by version`)).map((row) => row.version)
  const every = [1, 2, 3, 4, 5, 6, 7]
  // Every feature that keeps something in the store: organizations and the OAuth provider for MCP.
  const allOn = { organizations: { create: 'everyone' as const }, mcp: true as const }

  it('writes every migration into a fresh database and records them, then nothing once that is applied', async () => {
    const databaseUrl = await createDatabase()
    const auth = authOn(databaseUrl)
    const folder = await migrationsDir()
    await expect(checkAuthSchema(auth)).rejects.toThrow(/The auth store has no auth_migrations table.*`protobase auth migration`/)

    const file = await writeAuthMigration({ auth, dir: folder, name: 'auth' })
    expect(path.basename(file!)).toBe('001_auth.sql')
    const text = await readFile(file!, 'utf8')
    expect(text).toContain('create table "auth_migrations"')
    expect(text).toContain('create table if not exists "user"')
    expect(text).toContain('platform_sign_in text not null')
    expect(text).toContain('-- 7 mcp: ')

    await applyAll(databaseUrl, folder)
    await expect(checkAuthSchema(auth)).resolves.toBeUndefined()
    expect(await versions(databaseUrl)).toEqual(every)
    expect(await writeAuthMigration({ auth, dir: folder, name: 'auth' })).toBeUndefined()
    expect(await readdir(folder)).toEqual(['001_auth.sql'])
  })

  it('writes the same migrations whatever features the app turns on, with every table each of them needs', async () => {
    const featureSets = [{}, { organizations: allOn.organizations }, { mcp: allOn.mcp }, allOn]
    const written = new Set<string>()
    for (const features of featureSets) {
      const databaseUrl = await createDatabase()
      const auth = createAuth({ database: new pg.Pool({ connectionString: databaseUrl, max: 2 }), baseURL: 'http://localhost:1', secret, mailer: false, operator: false, signInProvider: false, ...features })
      pools.push(auth.options.database as pg.Pool)
      const folder = await migrationsDir()
      written.add(await readFile((await writeAuthMigration({ auth, dir: folder, name: 'auth' }))!, 'utf8'))
      await applyAll(databaseUrl, folder)
      await expect(checkAuthSchema(auth)).resolves.toBeUndefined()
      expect(await authSchemaDrift(auth)).toEqual([])
    }
    expect(written.size).toBe(1)
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
      signInProvider: false as const,
      users: { table: 'people', columns: { email: 'address', two_factor_enabled: 'mfa', last_organization_id: 'last_org' }, metadata: 'meta' },
      generateUserId: 'uuid' as const,
    }
    const auth = createAuth(options)
    const folder = await migrationsDir()
    const text = await readFile((await writeAuthMigration({ auth, dir: folder, name: 'auth' }))!, 'utf8')
    expect(text).toContain('create table if not exists "auth"."people" (id uuid default pg_catalog.gen_random_uuid() primary key)')
    expect(text).toContain('references "auth"."people" (id)')
    await applyAll(databaseUrl, folder)

    await expect(checkAuthSchema(auth)).resolves.toBeUndefined()
    expect(await versions(databaseUrl, 'auth.auth_migrations')).toEqual(every)
    expect(await authSchemaDrift(createAuth({ ...options, ...allOn }))).toEqual([])
    const columns = await query<{ name: string }>(
      databaseUrl,
      `select table_name || '.' || column_name || ' ' || udt_name as name from information_schema.columns where table_schema = 'auth' and (table_name = 'people' and column_name in ('address', 'mfa', 'last_org', 'meta') or table_name = 'session' and column_name = 'user_id') order by 1`,
    )
    expect(columns.map((row) => row.name)).toEqual(['people.address text', 'people.last_org text', 'people.meta jsonb', 'people.mfa bool', 'session.user_id uuid'])
    const made = await createUser(auth, { email: 'root@example.com', password: 'a-long-test-password' })
    expect(made.id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('needs no migration to turn a feature on later, and a user made with it off works with it on', async () => {
    const databaseUrl = await createDatabase()
    const off = authOn(databaseUrl)
    const folder = await migrationsDir()
    await writeAuthMigration({ auth: off, dir: folder, name: 'auth' })
    await applyAll(databaseUrl, folder)
    // The columns organizations and two-step sign-in add to the user and session tables are there, empty.
    await createUser(off, { email: 'root@example.com', password: 'a-long-test-password' })
    expect(await query(databaseUrl, 'select two_factor_enabled, last_organization_id from "user"')).toEqual([{ two_factor_enabled: false, last_organization_id: null }])

    const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 })
    pools.push(pool)
    const on = createAuth({ database: pool, baseURL: 'http://localhost:1', secret, mailer: false, operator: false, signInProvider: false, ...allOn })
    await expect(checkAuthSchema(on)).resolves.toBeUndefined()
    expect(await writeAuthMigration({ auth: on, dir: folder, name: 'auth' })).toBeUndefined()
    expect(await authSchemaDrift(on)).toEqual([])
    await createOrganization(on, { name: 'Acme', slug: 'acme', owner: 'root@example.com' })
    expect(await query(databaseUrl, 'select o.slug, m.role from member m join organization o on o.id = m.organization_id')).toEqual([{ slug: 'acme', role: 'owner' }])
  })

  it('writes only the migrations the store has not applied, as the next file', async () => {
    const databaseUrl = await createDatabase()
    const auth = authOn(databaseUrl)
    const folder = await migrationsDir()
    await writeAuthMigration({ auth, dir: folder, name: 'auth' })
    await applyAll(databaseUrl, folder)
    // The store as a version of Protobase before the last migration left it.
    await query(databaseUrl, `drop table oauth_client, oauth_resource, oauth_client_resource, oauth_refresh_token, oauth_access_token, oauth_consent, oauth_client_assertion; delete from auth_migrations where version = 7`)
    await expect(checkAuthSchema(auth)).rejects.toThrow(/The auth schema is behind this version of Protobase \(missing migrations 7 mcp\).*`protobase auth migration`/)

    const file = await writeAuthMigration({ auth, dir: folder, name: 'auth' })
    expect(path.basename(file!)).toBe('002_auth.sql')
    const text = await readFile(file!, 'utf8')
    expect(text).not.toContain('create table if not exists "user"')
    expect(text).not.toContain('create table "auth_migrations"')
    expect(text).toContain('-- 7 mcp: ')
    const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} })
    await sql.begin((tx) => tx.unsafe(text))
    await sql.end()
    await expect(checkAuthSchema(auth)).resolves.toBeUndefined()
    expect(await versions(databaseUrl)).toEqual(every)
  })

  // A store an earlier Protobase made by comparing its tables with Better Auth's: organizations on, MCP off, a user in it.
  const earlierStore = async () => {
    const databaseUrl = await createDatabase()
    const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 })
    pools.push(pool)
    const options = { database: pool, baseURL: 'http://localhost:1', secret, mailer: false as const, operator: false as const, signInProvider: false as const, organizations: allOn.organizations }
    await (await getMigrations(createAuth(options).options)).runMigrations()
    await query(databaseUrl, `insert into "user" (id, name, email, email_verified) values ('u1', 'Root', 'root@example.com', true)`)
    return { databaseUrl, auth: createAuth(options) }
  }

  it('adopts a store an earlier Protobase made, once: the migrations it matches are recorded, the others applied', async () => {
    const { databaseUrl, auth } = await earlierStore()
    await expect(checkAuthSchema(auth)).rejects.toThrow(/no auth_migrations table/)
    const folder = await migrationsDir()
    const text = await readFile((await writeAuthMigration({ auth, dir: folder, name: 'auth' }))!, 'utf8')
    expect(text).toContain('adopted: 1 core, 2 two_factor, 3 passkeys, 4 sign_in_policy, 5 staff_sign_in, 6 organizations')
    expect(text).not.toContain('create table if not exists "user"')
    expect(text).toContain('-- 7 mcp: ')

    await applyAll(databaseUrl, folder)
    await expect(checkAuthSchema(auth)).resolves.toBeUndefined()
    expect(await versions(databaseUrl)).toEqual(every)
    expect(await query(databaseUrl, 'select email from "user"')).toEqual([{ email: 'root@example.com' }])
    expect(await writeAuthMigration({ auth, dir: folder, name: 'auth' })).toBeUndefined()

    // Written from this store, the file stops on a database whose store lacks a table it adopts, changing nothing.
    const other = await earlierStore()
    await query(other.databaseUrl, 'drop table passkey')
    await expect(applyAll(other.databaseUrl, folder)).rejects.toThrow(/does not match the migrations this file adopts: it lacks passkey\.aaguid, passkey\.backed_up, /)
    expect(await query(other.databaseUrl, "select to_regclass('auth_migrations') as found")).toEqual([{ found: null }])
  })

  it('refuses to adopt a store that matches no version, naming what differs', async () => {
    const { databaseUrl, auth } = await earlierStore()
    await query(databaseUrl, 'alter table passkey drop column rp_id; alter table jwks alter column alg type integer using null')
    const folder = await migrationsDir()
    await expect(writeAuthMigration({ auth, dir: folder, name: 'auth' })).rejects.toThrow(
      /matches none of its migrations' versions: 1 core has jwks\.alg as int4, not text; 3 passkeys lacks passkey\.rp_id\. Bring it to the schema of Protobase 0\.47 first/,
    )
    expect(await readdir(folder)).toEqual([])
    expect(await query(databaseUrl, "select nspname from pg_namespace where nspname = 'protobase_auth_adoption'")).toEqual([])
  })

  it('refuses a store a newer Protobase migrated', async () => {
    const databaseUrl = await createDatabase()
    const auth = authOn(databaseUrl)
    const folder = await migrationsDir()
    await writeAuthMigration({ auth, dir: folder, name: 'auth' })
    await applyAll(databaseUrl, folder)
    await query(databaseUrl, "insert into auth_migrations (version, name) values (8, 'later')")
    await expect(checkAuthSchema(auth)).rejects.toThrow('The auth store is at migration 8, newer than the 7 this version of Protobase knows; upgrade Protobase')
    await expect(writeAuthMigration({ auth, dir: folder, name: 'auth' })).rejects.toThrow(/newer than the 7/)
  })

  it('compares the tables only in the development check, which names what drifted', async () => {
    const databaseUrl = await createDatabase()
    const auth = authOn(databaseUrl)
    const folder = await migrationsDir()
    await writeAuthMigration({ auth, dir: folder, name: 'auth' })
    await applyAll(databaseUrl, folder)
    await query(databaseUrl, 'alter table passkey drop column rp_id')
    await expect(checkAuthSchema(auth)).resolves.toBeUndefined()
    expect(await authSchemaDrift(auth)).toEqual(['lacks the column passkey.rp_id'])
  })

  it('checks without writing: it works on a read-only connection', async () => {
    const databaseUrl = await createDatabase()
    const folder = await migrationsDir()
    await writeAuthMigration({ auth: authOn(databaseUrl), dir: folder, name: 'auth' })
    await applyAll(databaseUrl, folder)
    const readOnly = authOn(databaseUrl, { options: '-c default_transaction_read_only=on' })
    await expect(checkAuthSchema(readOnly)).resolves.toBeUndefined()
  })

  it('keeps protobase serve from starting while the store is behind', async () => {
    const databaseUrl = await createDatabase()
    const config = servedConfig({ url: 'http://localhost:1', secret, auth: storeAuth, authenticate: () => Promise.reject(unauthorized('no')) })
    await expect(startServe({ config, env: { port: 0, databaseUrl, requestLog: false, filesCleanupMinutes: 0, runJobs: true, startupChecks: true, trustedProxies: [] } })).rejects.toThrow(/The auth store has no auth_migrations table.*`protobase auth migration`/)
  })
})

// The routes that read tables, the API, the Supabase-compatible endpoints, realtime and MCP, read the app's resources
// only, so the store is kept from all of them by refusing a resource over any of its tables.
describe.skipIf(!reachable)('the auth store and the app\'s resources', () => {
  const over = (table: string) => resource(table.replace('.', '_')).table(table).fields({ id: f.text() }).primaryKey((r) => r.id).toModel()
  // A migrated store in `schemaName`, or the search path, and the app's own table `orders`.
  const migrated = async ({ schemaName, users }: { schemaName?: string; users?: { table: string } } = {}) => {
    const databaseUrl = await createDatabase()
    const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 })
    pools.push(pool)
    if (schemaName) await pool.query(`create schema ${schemaName}`)
    const database = schemaName ? { dialect: new PostgresDialect({ pool }), type: 'postgres' as const, schemaName } : pool
    const auth = createAuth({ database, baseURL: 'http://localhost:1', secret, mailer: false, operator: false, signInProvider: false, ...(users && { users }) })
    await pool.query((await authSchemaMigration(auth))!)
    await pool.query('create table orders (id text primary key)')
    const db = new Kysely<any>({ dialect: new PostgresDialect({ pool }) })
    return { databaseUrl, auth, db }
  }

  it('refuses a resource over any table of a store in the search path, and takes the app\'s own', async () => {
    const { auth, db } = await migrated({ users: { table: 'people' } })
    await expect(checkResourcesOutsideAuthStore(db, [over('orders')], auth)).resolves.toBeUndefined()
    for (const table of ['people', 'session', 'oauth_consent', 'member', 'auth_migrations', 'public.jwks']) {
      await expect(checkResourcesOutsideAuthStore(db, [over('orders'), over(table)], auth)).rejects.toThrow(/Resources over the auth store's tables, which hold password hashes, sessions and tokens: \w+ \(public\.\w+\)/)
    }
  })

  it('refuses a resource over a table of a store in its own schema, and takes a table of the same name elsewhere', async () => {
    const { auth, db } = await migrated({ schemaName: 'auth' })
    await db.schema.createTable('session').addColumn('id', 'text', (column) => column.primaryKey()).execute()
    await expect(checkResourcesOutsideAuthStore(db, [over('session'), over('public.session')], auth)).resolves.toBeUndefined()
    await expect(checkResourcesOutsideAuthStore(db, [over('auth.user')], auth)).rejects.toThrow('auth_user (auth.user)')
  })

  it('keeps protobase serve from starting with a resource over the store', async () => {
    const { databaseUrl } = await migrated()
    const session = resource('session').table('session').fields({ id: f.text() }).primaryKey((r) => r.id)
    const config = servedConfig({ config: { session }, url: 'http://localhost:1', secret, auth: storeAuth, authenticate: () => Promise.reject(unauthorized('no')) })
    await expect(startServe({ config, env: { port: 0, databaseUrl, requestLog: false, filesCleanupMinutes: 0, runJobs: true, startupChecks: true, trustedProxies: [] } })).rejects.toThrow(/Resources over the auth store's tables.*session \(public\.session\)/)
  })
})

// The migrate step of the examples and presets, copied into a project of its own with migrations the test writes.
describe.skipIf(!reachable)("a project's migrate step", () => {
  const scratchDir = path.join(root, 'examples/scratch')
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
    const [found] = await sql<{ exists: boolean }[]>`select to_regclass('public.schema_migrations') is not null as exists`
    const applied = found!.exists ? (await sql`select name from public.schema_migrations order by name`).map((row) => row.name) : []
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

  it('lets two runs at once take turns, so each migration is applied once', async () => {
    const databaseUrl = await createDatabase()
    await migrations({ '001_shop.sql': 'create table shop_items (id int primary key); select pg_sleep(0.5);' })
    const [first, second] = await Promise.all([migrate(databaseUrl), migrate(databaseUrl)])
    expect([first.status, second.status]).toEqual([0, 0])
    expect(first.stdout + second.stdout).toBe('applied 001_shop.sql\n')
    expect(await state(databaseUrl)).toEqual({ applied: ['001_shop.sql'], tables: ['shop_items'] })
  }, 120_000)
})
