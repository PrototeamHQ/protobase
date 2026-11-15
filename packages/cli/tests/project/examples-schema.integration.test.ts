import { randomBytes } from 'node:crypto'
import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { loadSourceConfig } from '../../src/config/source-config'
import { applyMigrations } from '../../src/migration/apply-migrations'
import { startServe } from '../../src/serve/lifecycle'
import { root } from '../support/auth-project'
import { databaseReachable, testDatabaseUrl } from '../support/database'
import { withDatabase } from '../support/serve-process'

// afterAll drops every database the tests made, one at a time, and a loaded Postgres takes seconds for some drops.
vi.setConfig({ hookTimeout: 30_000, testTimeout: 60_000 })

const url = testDatabaseUrl()
const reachable = await databaseReachable(url)

const examplesDir = path.join(root, 'tests', 'apps')
const examples = readdirSync(examplesDir).filter((name) => existsSync(path.join(examplesDir, name, 'protobase.config.ts')))

const maintenance = () => postgres(withDatabase(url, 'postgres'), { max: 1, onnotice: () => {} })

const databases: string[] = []
const createDatabase = async () => {
  const name = `protobase_example_schema_${randomBytes(4).toString('hex')}`
  const sql = maintenance()
  await sql.unsafe(`create database ${name}`)
  await sql.end()
  databases.push(name)
  return withDatabase(url, name)
}

beforeAll(() => {
  vi.stubEnv('PROTOBASE_SECRET', 'a-secret-only-this-test-uses-0123456789')
  vi.stubEnv('PROTOBASE_URL', 'http://localhost:5173')
})

afterAll(async () => {
  vi.unstubAllEnvs()
  if (!reachable) return
  const sql = maintenance()
  for (const name of databases) await sql.unsafe(`drop database if exists ${name} with (force)`)
  await sql.end()
})

// Each example, which is also what a preset starts an app from and what protobase-try.exe serves (automations), on a
// fresh database with only its own db/migrations applied, as the runtime's `migrate` applies a bundle's: serve's
// startup checks refuse a schema the server needs more of, so a schema change ships with each example's migration,
// written by `protobase migration` on a database its migrations made.
describe.skipIf(!reachable).each(examples)('the %s example', (name) => {
  it('starts protobase serve on its own migrations', async () => {
    const databaseUrl = await createDatabase()
    const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} })
    await applyMigrations(sql, path.join(examplesDir, name, 'db', 'migrations'), () => {})
    await sql.end()

    const config = await loadSourceConfig(path.join(examplesDir, name), { command: 'serve' })
    const server = await startServe({ config, env: { port: 0, host: '127.0.0.1', databaseUrl, requestLog: false, filesCleanupMinutes: 0, runJobs: false, startupChecks: true, trustedProxies: [] } })
    expect((await fetch(`http://127.0.0.1:${server.port}/health`)).status).toBe(200)
    await server.close()
  })
})
