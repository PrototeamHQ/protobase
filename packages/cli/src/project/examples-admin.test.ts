import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { Kysely, PostgresDialect } from 'kysely'
import pg from 'pg'
import { buildProject } from '../config/build-project'
import { loadSourceConfig } from '../config/source-config'
import { projectAdmin } from './project-admin'

// Each example's auth gets a pg pool, which connects nothing until a query.
vi.unmock('pg')

const examplesDir = path.join(import.meta.dirname, '..', '..', '..', '..', 'examples')
const examples = readdirSync(examplesDir).filter((name) => existsSync(path.join(examplesDir, name, 'protobase.config.ts')))

// Each example, which is also what a preset starts an app from, built as `dev` and `serve` build its admin API: with
// its own auth, so the startup checks that look at the auth instance, such as an owner field that must hold its user
// ids, refuse here instead of on an app's first start. Building the API reaches no database.
describe.each(examples)('the %s example', (name) => {
  beforeAll(() => {
    vi.stubEnv('PROTOBASE_SECRET', 'a-secret-only-this-test-uses-0123456789')
    vi.stubEnv('PROTOBASE_URL', 'http://localhost:5173')
  })

  afterAll(() => {
    vi.unstubAllEnvs()
  })

  it('passes the startup checks with its own auth', async () => {
    const config = await loadSourceConfig(path.join(examplesDir, name), { command: 'tool' })
    expect(config.auth, 'every example signs in with Better Auth').toBeDefined()
    const pool = new pg.Pool({ connectionString: 'postgres://nobody@127.0.0.1:1/none' })
    const project = await buildProject(config, { db: new Kysely<any>({ dialect: new PostgresDialect({ pool }) }), pool })
    expect(() => projectAdmin(project, {} as never)).not.toThrow()
    await pool.end()
  }, 60_000)
})
