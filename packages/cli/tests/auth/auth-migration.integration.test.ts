import { randomBytes } from 'node:crypto'
import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { getMigrations } from 'better-auth/db/migration'
import pg from 'pg'
import postgres from 'postgres'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { checkAuthSchema, createAuth, unauthorized, type AdminAuth } from '@protobase/server'
import { writeAuthMigration } from '../../src/auth/write-migration'
import { startServe } from '../../src/serve/lifecycle'
import { root, run, typescriptArgs } from '../support/auth-project'
import { databaseReachable, testDatabaseUrl } from '../support/database'
import { withDatabase } from '../support/serve-process'

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

  it('writes every table into a fresh database, then nothing once that is applied', async () => {
    const databaseUrl = await createDatabase()
    const auth = authOn(databaseUrl)
    const folder = await migrationsDir()
    await expect(checkAuthSchema(auth)).rejects.toThrow(/The auth schema is behind this version of Protobase \(missing user, session, account.*`protobase auth migration`/)

    const file = await writeAuthMigration({ auth, dir: folder, name: 'auth' })
    expect(path.basename(file!)).toBe('001_auth.sql')
    const text = await readFile(file!, 'utf8')
    expect(text).toContain('create table if not exists "user"')
    expect(text).toContain('"platformSignIn" text not null')

    await applyAll(databaseUrl, folder)
    await expect(checkAuthSchema(auth)).resolves.toBeUndefined()
    expect(await writeAuthMigration({ auth, dir: folder, name: 'auth' })).toBeUndefined()
    expect(await readdir(folder)).toEqual(['001_auth.sql'])
  })

  it('writes only what an older schema lacks, as the next migration', async () => {
    const databaseUrl = await createDatabase()
    const auth = authOn(databaseUrl)
    const folder = await migrationsDir()
    await writeAuthMigration({ auth, dir: folder, name: 'auth' })
    await applyAll(databaseUrl, folder)
    // The schema of an earlier Protobase: no staff sign-in log, no policy for sign-in through the platform.
    const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} })
    await sql.unsafe(`drop table "staffSignIn"; alter table "signInPolicy" drop column "platformSignIn"; alter table "signInPolicy" drop column "staffAccess"`)
    await sql`insert into "signInPolicy" (id, password, "emailCode", passkey, "twoFactor", "createdAt") values ('p1', 'allowed', 'allowed', 'allowed', 'required', now())`
    await sql.end()
    await expect(checkAuthSchema(auth)).rejects.toThrow(/missing staffSignIn, signInPolicy\.staffAccess, signInPolicy\.platformSignIn\)/)

    const file = await writeAuthMigration({ auth, dir: folder, name: 'auth_staff' })
    expect(path.basename(file!)).toBe('002_auth_staff.sql')
    const text = await readFile(file!, 'utf8')
    expect(text).not.toContain('"user"')
    expect(text).toContain('create table if not exists "staffSignIn"')
    expect(text).toContain('alter table "signInPolicy" add column if not exists "platformSignIn"')

    // Applied on its own, as the migrate step does with the files not applied yet; the saved row gets the defaults.
    const next = postgres(databaseUrl, { max: 1, onnotice: () => {} })
    await next.begin((tx) => tx.unsafe(text))
    expect(await next`select "staffAccess", "platformSignIn" from "signInPolicy"`).toEqual([{ staffAccess: 'allowed', platformSignIn: 'allowed' }])
    await next.end()
    await expect(checkAuthSchema(auth)).resolves.toBeUndefined()
  })

  // Upgrading a project whose store `auth:migrate` of Protobase 0.5 set up: one migration written from an empty
  // database, one from the project's, and both apply to either.
  it('writes migrations that apply to a fresh database and to a store an earlier version set up in place', async () => {
    const earlier = await createDatabase()
    const setUp = authOn(earlier)
    await (await getMigrations(setUp.options)).runMigrations()
    const sql = postgres(earlier, { max: 1, onnotice: () => {} })
    await sql.unsafe(`alter table "signInPolicy" drop column "platformSignIn"; insert into "user" (id, name, email, "emailVerified") values ('u1', 'Root', 'root@example.com', true)`)
    await sql.end()

    const folder = await migrationsDir()
    const fresh = await createDatabase()
    expect(path.basename((await writeAuthMigration({ auth: authOn(fresh), dir: folder, name: 'auth' }))!)).toBe('001_auth.sql')
    expect(path.basename((await writeAuthMigration({ auth: authOn(earlier), dir: folder, name: 'auth_upgrade' }))!)).toBe('002_auth_upgrade.sql')

    for (const databaseUrl of [earlier, fresh]) {
      await applyAll(databaseUrl, folder)
      await expect(checkAuthSchema(authOn(databaseUrl))).resolves.toBeUndefined()
    }
    const after = postgres(earlier, { max: 1, onnotice: () => {} })
    expect(await after`select email from "user"`).toEqual([{ email: 'root@example.com' }])
    await after.end()
  })

  it('checks without writing: it works on a read-only connection', async () => {
    const databaseUrl = await createDatabase()
    const folder = await migrationsDir()
    await writeAuthMigration({ auth: authOn(databaseUrl), dir: folder, name: 'auth' })
    await applyAll(databaseUrl, folder)
    const readOnly = authOn(databaseUrl, { options: '-c default_transaction_read_only=on' })
    await expect(checkAuthSchema(readOnly)).resolves.toBeUndefined()
  })

  it('keeps protobase serve from starting while the schema is behind', async () => {
    const databaseUrl = await createDatabase()
    const auth: AdminAuth = authOn(databaseUrl)
    const project = { config: {}, auth, authenticate: () => Promise.reject(unauthorized('no')) }
    await expect(startServe({ project, env: { port: 0, databaseUrl, requestLog: false } })).rejects.toThrow(/The auth schema is behind.*`protobase auth migration`/)
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
