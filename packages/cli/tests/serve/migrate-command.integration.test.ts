import { randomBytes } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import postgres from 'postgres'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { manifestFile } from '../../src/bundle/manifest'
import { protobaseVersion } from '../../src/version/version'
import { root, run, typescriptArgs } from '../support/auth-project'
import { databaseReachable, testDatabaseUrl } from '../support/database'
import { withDatabase } from '../support/serve-process'

// afterAll drops every database the tests made, one at a time, and a loaded Postgres takes seconds for some drops.
vi.setConfig({ hookTimeout: 30_000, testTimeout: 60_000 })

const url = testDatabaseUrl()
const reachable = await databaseReachable(url)
const runtime = path.join(root, 'packages/cli/src/serve/main.ts')

const maintenance = () => postgres(withDatabase(url, 'postgres'), { max: 1, onnotice: () => {} })

// `migrate` connects as an app does: a role that owns its database and is no superuser.
const role = `protobase_migrate_${randomBytes(4).toString('hex')}`
const password = `pw${randomBytes(12).toString('hex')}`

const databases: string[] = []
const createDatabase = async () => {
  const name = `protobase_migrate_command_${randomBytes(4).toString('hex')}`
  const sql = maintenance()
  await sql.unsafe(`create database ${name} owner ${role}`)
  await sql.end()
  databases.push(name)
  const next = new URL(withDatabase(url, name))
  next.username = role
  next.password = password
  return next.toString()
}

// A bundle as `protobase build` lays it out, whose config module throws when anything imports it: `migrate` must not.
const folders: string[] = []
const createBundle = async (migrations: Record<string, string> | undefined) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'protobase-migrate-bundle-'))
  folders.push(dir)
  const shell = { protobase: protobaseVersion, pluginApi: 1, paths: ['/index.html'] }
  const manifest = { version: 3, protobase: protobaseVersion, server: 'protobase.config.js', public: 'public', spa: 'index.html', api: ['/api'], plugins: [], theme: 'protobase.theme.css', shell }
  await writeFile(path.join(dir, manifestFile), JSON.stringify(migrations ? { ...manifest, migrations: 'migrations' } : manifest))
  await writeFile(path.join(dir, 'protobase.config.js'), "throw new Error('the config module ran')\n")
  if (!migrations) return dir
  await mkdir(path.join(dir, 'migrations'))
  for (const [name, sql] of Object.entries(migrations)) await writeFile(path.join(dir, 'migrations', name), sql)
  return dir
}

// The runtime's command line on the test's own runtime, with only the environment given.
const migrate = (bundle: string, env: Record<string, string>) => run([...typescriptArgs(runtime), 'migrate', bundle], root, { DATABASE_URL: '', ...env })

const tables = async (databaseUrl: string) => {
  const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} })
  const rows = await sql`select table_name from information_schema.tables where table_schema = 'public' order by table_name`
  await sql.end()
  return rows.map((row) => row.table_name)
}

afterEach(async () => {
  await Promise.all(folders.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

beforeAll(async () => {
  if (!reachable) return
  const sql = maintenance()
  await sql.unsafe(`create role ${role} with login nosuperuser nocreatedb nocreaterole password '${password}'`)
  await sql.end()
})

afterAll(async () => {
  if (!reachable) return
  const sql = maintenance()
  for (const name of databases) await sql.unsafe(`drop database if exists ${name} with (force)`)
  await sql.unsafe(`drop role if exists ${role}`)
  await sql.end()
})

describe.skipIf(!reachable)('protobase-serve migrate', () => {
  it("applies the bundle's migrations with DATABASE_URL alone, never running the app's code", async () => {
    const databaseUrl = await createDatabase()
    const bundle = await createBundle({ '001_one.sql': 'create table one ();\n' })

    const applied = await migrate(bundle, { DATABASE_URL: databaseUrl })
    expect(applied.stderr).toBe('')
    expect(applied.stdout).toBe('applying 001_one.sql\napplied 1 migrations\n')
    expect(applied.status).toBe(0)
    expect(await tables(databaseUrl)).toEqual(['one'])

    const again = await migrate(bundle, { DATABASE_URL: databaseUrl })
    expect(again.stdout).toBe('the database is up to date\n')
  })

  it('says so for a bundle without migrations, needing no database', async () => {
    const result = await migrate(await createBundle(undefined), {})
    expect(result.stdout).toBe('the bundle has no migrations\n')
    expect(result.status).toBe(0)
  })

  it('fails without DATABASE_URL, or when the folder the manifest names is missing', async () => {
    const unset = await migrate(await createBundle({ '001_one.sql': 'create table one ();\n' }), {})
    expect(unset.status).toBe(1)
    expect(unset.stderr).toBe('error: No database: set DATABASE_URL\n')

    const bundle = await createBundle({})
    await rm(path.join(bundle, 'migrations'), { recursive: true })
    const missing = await migrate(bundle, { DATABASE_URL: await createDatabase() })
    expect(missing.status).toBe(1)
    expect(missing.stdout).not.toMatch(/applied|up to date/)
  })

  it('fails closed, leaving the schema unchanged, when the connection dies mid-run', async () => {
    const databaseUrl = await createDatabase()
    const bundle = await createBundle({ '001_one.sql': 'create table one ();\n', '002_two.sql': 'create table two ();\nselect pg_terminate_backend(pg_backend_pid());\n' })

    const result = await migrate(bundle, { DATABASE_URL: databaseUrl })
    expect(result.status).not.toBe(0)
    expect(result.stdout).not.toMatch(/applied|up to date/)
    expect(await tables(databaseUrl)).toEqual([])
  })

  it('never prints the database password, on a wrong one or a server that refuses connections', async () => {
    const bundle = await createBundle({ '001_one.sql': 'create table one ();\n' })
    const wrong = new URL(await createDatabase())
    wrong.password = `wrong${randomBytes(8).toString('hex')}`
    const refused = `postgres://${role}:${password}@127.0.0.1:1/none`

    for (const [databaseUrl, secret] of [[wrong.toString(), wrong.password], [refused, password]] as const) {
      const result = await migrate(bundle, { DATABASE_URL: databaseUrl })
      expect(result.status).toBe(1)
      expect(result.stdout + result.stderr).not.toContain(secret)
      expect(result.stdout + result.stderr).not.toContain(databaseUrl)
    }
  })
})
