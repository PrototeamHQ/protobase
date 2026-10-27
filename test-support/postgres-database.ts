import { randomBytes } from 'node:crypto'
import { Kysely, PostgresDialect } from 'kysely'
import pg from 'pg'
import { onTestFinished, TestRunner } from 'vitest'
import { snapshotTemplates, type SnapshotTemplateKey } from '../scripts/test-db/snapshot-templates'
import { cloneTemplate, databaseUrl, dropDatabase, templateState } from '../scripts/test-db/templates'

// The real-Postgres tests (`*.postgres.test.ts` and the end-to-end tests): what a recording cannot replay, such as
// workers that poll and retry on real timers, each on a clone of a test template that `bun run test:db` builds.

/**
 * Whether the template is there to clone, so a file's tests can skip without a Postgres server, as the integration
 * tests do; in CI a missing one fails the run instead, and a stale one always does.
 */
export const postgresTemplateReady = async (key: SnapshotTemplateKey) => {
  const template = snapshotTemplates[key]
  const state = await templateState(template)
  if (state === 'stale') throw new Error(`${template.database} is older than what it is built from: run bun run test:db`)
  if (state === 'ready') return true
  if (process.env.CI) throw new Error(`${template.database} is ${state}: CI must run bun run test:db against a Postgres service first`)
  return false
}

/** A clone of a test template: its URL, a pool and Kysely over it, and `exec` for any number of statements. */
export type PostgresDatabase = {
  url: string
  db: Kysely<any>
  dialect: PostgresDialect
  exec: (sql: string) => Promise<void>
  close: () => Promise<void>
}

/**
 * Clones the template `key` into a database of its own. One opened in a test, its body or a beforeEach, is dropped when
 * that test finishes; the caller closes one opened outside a test.
 */
export const openPostgresDatabase = async (key: SnapshotTemplateKey): Promise<PostgresDatabase> => {
  const template = snapshotTemplates[key]
  const database = `${template.database.replace(/_template$/, '')}_clone_${randomBytes(4).toString('hex')}`
  await cloneTemplate(template, database)
  const url = databaseUrl(database)
  const pool = new pg.Pool({ connectionString: url, max: 5 })
  const dialect = new PostgresDialect({ pool })
  // pool.end() resolves once it has asked its clients to end, before their connections close; dropping the database
  // `with (force)` then would terminate a backend still open, and its idle client's 57P01 reaches the pool uncaught.
  const open = new Set<pg.PoolClient>()
  const waiting: (() => void)[] = []
  pool.on('connect', (client) => open.add(client))
  pool.on('remove', (client) => {
    open.delete(client)
    if (!open.size) waiting.splice(0).forEach((resolve) => resolve())
  })
  const allClosed = () => (open.size ? new Promise<void>((resolve) => waiting.push(resolve)) : Promise.resolve())
  const close = async () => {
    if (!pool.ending) await pool.end()
    await allClosed()
    await dropDatabase(database)
  }
  if (TestRunner.getCurrentTest()) onTestFinished(close)
  return { url, db: new Kysely<any>({ dialect }), dialect, exec: async (sql) => void (await pool.query(sql)), close }
}
