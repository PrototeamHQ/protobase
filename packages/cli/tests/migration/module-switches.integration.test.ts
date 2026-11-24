import { randomBytes, randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import pg from 'pg'
import postgres from 'postgres'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { checkMigrationRecord, createUser, setUserBanned, setUserRole, type AdminAuth } from '@protobase/server'
import { betterAuthAuthenticator, createAuth, organizationsInput, storeNames } from '@protobase/server/internal'
import { writeAuthMigration } from '../../src/auth/write-migration'
import { applyMigrations } from '../../src/migration/apply-migrations'
import { runMigration, type MigrationRun } from '../../src/migration/snapshot/run-migration'
import { databaseReachable, testDatabaseUrl } from '../support/database'
import { withDatabase } from '../support/serve-process'

vi.setConfig({ hookTimeout: 60_000, testTimeout: 60_000 })

// A module turned off and on again on a real database: personal access tokens, whose rows act for people again.

const url = testDatabaseUrl()
const reachable = await databaseReachable(url)
const maintenance = () => postgres(withDatabase(url, 'postgres'), { max: 1, onnotice: () => {} })
const origin = 'http://localhost:1'
const secret = 'integration-test-secret-integration-test'
const prefix = 'app_'

const databases: string[] = []
const dirs: string[] = []
const pools: pg.Pool[] = []

afterEach(async () => {
  await Promise.all(pools.splice(0).map((pool) => pool.end()))
})

afterAll(async () => {
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })))
  const sql = maintenance()
  for (const name of databases) await sql.unsafe(`drop database if exists ${name} with (force)`)
  await sql.end()
})

const createDatabase = async () => {
  const name = `protobase_modules_${randomBytes(4).toString('hex')}`
  const sql = maintenance()
  await sql.unsafe(`create database ${name}`)
  await sql.end()
  databases.push(name)
  return withDatabase(url, name)
}

// The app's auth over the database, with personal access tokens on or off.
const authOf = (databaseUrl: string, tokens: boolean) => {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 })
  pools.push(pool)
  return createAuth({ database: pool, baseURL: origin, secret, mailer: false, operator: false, signInProviders: [], roles: { sales: 'Sales', support: 'Support' }, ...(tokens && { personalAccessTokens: { prefix } }) })
}

const project = async () => {
  const projectDir = await mkdtemp(path.join(tmpdir(), 'protobase-modules-'))
  dirs.push(projectDir)
  return { projectDir, dir: path.join(projectDir, 'db/migrations') }
}

// `protobase migration` for `auth`, with the database's rows counted when `database` is set.
const migration = (where: { projectDir: string; dir: string }, auth: AdminAuth, run: Partial<MigrationRun> = {}) =>
  runMigration({ ...where, auth: { names: storeNames(auth), organizationsOn: false, organizations: undefined }, database: undefined, protobaseVersion: '1.0.0', newId: randomUUID, ...run })

// `protobase migrate`, with `--force` or without.
const migrate = async (databaseUrl: string, dir: string, force = false) => {
  const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} })
  try {
    return await applyMigrations(sql, dir, () => {}, { force })
  } finally {
    await sql.end()
  }
}

const count = async (databaseUrl: string, table: string) => {
  const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} })
  try {
    const [row] = await sql.unsafe<{ rows: number }[]>(`select count(*)::int as rows from ${table}`)
    return row!.rows
  } finally {
    await sql.end()
  }
}

// Ana's personal access token, made on her account page as `sales`.
const tokenOf = async (auth: AdminAuth) => {
  await createUser(auth, { email: 'root@example.com', password: 'a-long-test-password' })
  await createUser(auth, { email: 'ana@example.com', password: 'a-long-test-password', role: 'sales' })
  const headers = { 'content-type': 'application/json', origin }
  const signedIn = await auth.handler(new Request(`${origin}/api/auth/sign-in/email`, { method: 'POST', headers, body: JSON.stringify({ email: 'ana@example.com', password: 'a-long-test-password' }) }))
  expect(signedIn.status).toBe(200)
  const cookie = signedIn.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ')
  const created = await auth.handler(new Request(`${origin}/api/auth/account/personal-access-tokens/create`, { method: 'POST', headers: { ...headers, cookie }, body: JSON.stringify({ name: 'Weekly invoices' }) }))
  expect(created.status, await created.clone().text()).toBe(200)
  return ((await created.json()) as { token: string }).token
}

// The session the token stands for, or the status it is refused with.
const sessionOf = async (auth: AdminAuth, token: string) =>
  Promise.resolve(betterAuthAuthenticator({ auth })(new Request(`${origin}/api/v1/things`, { headers: { authorization: `Bearer ${token}` } }))).then(
    (session) => session.user.roles,
    (error: { status?: number }) => error.status,
  )

describe.skipIf(!reachable)('a sign-in module turned off and on again', () => {
  it('keeps its tables and rows, refuses them back without --force, and its tokens act again only as their user stands now', async () => {
    const databaseUrl = await createDatabase()
    const where = await project()
    const on = authOf(databaseUrl, true)
    await migration(where, on)
    await migrate(databaseUrl, where.dir)
    const token = await tokenOf(on)
    expect(await sessionOf(on, token)).toEqual(['sales'])

    // Off, kept: the server starts without the module, and its rows stay.
    const off = authOf(databaseUrl, false)
    await expect(checkMigrationRecord(off, '1.0.0')).rejects.toThrow(/so the server will not start/)
    await migration(where, off, { off: 'keep' })
    await migrate(databaseUrl, where.dir)
    await expect(checkMigrationRecord(off, '1.0.0')).resolves.toBeUndefined()
    expect(await count(databaseUrl, 'personal_access_token')).toBe(1)
    await setUserRole(off, { email: 'ana@example.com', role: 'support' })

    // On again: refused while the kept table holds a row, in the CLI and in the file, and let through with --force.
    const again = authOf(databaseUrl, true)
    await expect(migration(where, again, { database: { url: databaseUrl, parts: [] } })).rejects.toThrow(
      'personal_access_tokens is on again while its kept tables hold rows: personal_access_token 1. Delete them in a migration of the project\'s own first, or bring them back: pass --force to write the migration, and apply it with `protobase migrate --force`',
    )
    const file = await migration(where, again, { database: { url: databaseUrl, parts: [] }, force: true })
    expect(await readFile(file!, 'utf8')).toContain('-- personal_access_tokens on again:')
    await expect(migrate(databaseUrl, where.dir)).rejects.toThrow('The personal_access_tokens module was kept while off, and its tables still hold rows: personal_access_token 1.')
    expect(await migrate(databaseUrl, where.dir, true)).toEqual([path.basename(file!)])
    await expect(checkMigrationRecord(again, '1.0.0')).resolves.toBeUndefined()

    // The token carries `sales`, which Ana no longer holds; once she does again, it acts, until she is banned or it expires.
    expect(await sessionOf(again, token)).toBe(401)
    await setUserRole(again, { email: 'ana@example.com', role: 'sales' })
    expect(await sessionOf(again, token)).toEqual(['sales'])
    await setUserBanned(again, { email: 'ana@example.com', banned: true })
    expect(await sessionOf(again, token)).toBe(401)
    await setUserBanned(again, { email: 'ana@example.com', banned: false })
    const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} })
    await sql`update personal_access_token set expires_at = now() - interval '1 minute'`
    await sql.end()
    expect(await sessionOf(again, token)).toBe(401)
  })

  it('turns a module on again without asking while its kept tables are empty', async () => {
    const databaseUrl = await createDatabase()
    const where = await project()
    await migration(where, authOf(databaseUrl, true))
    await migrate(databaseUrl, where.dir)
    await migration(where, authOf(databaseUrl, false), { off: 'keep' })
    await migrate(databaseUrl, where.dir)
    const again = authOf(databaseUrl, true)
    const confirmRevival = vi.fn(async () => false)
    expect(await migration(where, again, { database: { url: databaseUrl, parts: [] }, confirmRevival })).toBeDefined()
    expect(confirmRevival).not.toHaveBeenCalled()
    expect(await migrate(databaseUrl, where.dir)).toHaveLength(1)
    await expect(checkMigrationRecord(again, '1.0.0')).resolves.toBeUndefined()
  })

  it('writes no auth migration for organizations kept off, from the default organization the config keeps', async () => {
    const databaseUrl = await createDatabase()
    const where = await project()
    const organizations = organizationsInput({ default: { id: 'main', name: 'Main', slug: 'main' } })!
    const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 })
    pools.push(pool)
    const on = createAuth({ database: pool, baseURL: origin, secret, mailer: false, operator: false, signInProviders: [], organizations })
    await runMigration({ ...where, auth: { names: storeNames(on), organizationsOn: true, organizations }, database: undefined, protobaseVersion: '1.0.0', newId: randomUUID })
    await migrate(databaseUrl, where.dir)
    const off = authOf(databaseUrl, false)
    await runMigration({ ...where, auth: { names: storeNames(off), organizationsOn: false, organizations }, database: undefined, protobaseVersion: '1.0.0', newId: randomUUID, off: 'keep' })
    await migrate(databaseUrl, where.dir)

    // The sign-in has no organizations while they are off; the config still gives their default.
    await expect(writeAuthMigration({ ...where, name: 'auth', auth: off })).rejects.toThrow('organizations.default is not set, and organizations were on')
    expect(await writeAuthMigration({ ...where, name: 'auth', auth: off, organizations })).toBeUndefined()
  })
})
