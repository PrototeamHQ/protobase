import { getMigrations } from 'better-auth/db/migration'
import { Kysely, PostgresDialect, sql } from 'kysely'
import pg from 'pg'
import { createAuth, jobsSchemaMigration } from '@protobase/server'
import { queryDdl } from '../../test-support/fixtures/query-ddl'
import { serverDdl } from '../../test-support/fixtures/server-ddl'
import type { Template } from './templates'

// The databases `bun run test:record` records the snapshot tests on (test-support/sql-snapshot.ts): each recorded test
// file clones the one it opens. `bun run test:db snapshots` builds them; each takes a second or two. Each is vacuumed
// as it is built, so the planner sees the same visibility map whether autovacuum got to it or not.

type Db = Kysely<any>

const exec = (db: Db, text: string) => sql.raw(text).execute(db)

const snapshot = (database: string, sources: string[], fill: (db: Db, url: string) => Promise<unknown>) =>
  ({ database, strategy: 'wal_log', sources: ['scripts/test-db/snapshot-templates.ts', ...sources], fill }) as const satisfies Template & { fill: unknown }

export const snapshotTemplates = {
  /** An empty database. */
  empty: snapshot('snapshot_empty_test_template', [], async () => {}),
  /** pg_trgm and nothing else. */
  trigram: snapshot('snapshot_trigram_test_template', [], (db) => exec(db, 'create extension pg_trgm')),
  /** The query tests' tables, analyzed. */
  query: snapshot('snapshot_query_test_template', ['test-support/fixtures/query-ddl.ts'], async (db) => {
    await exec(db, queryDdl)
    await exec(db, 'vacuum analyze')
  }),
  /** The query tests' tables with pg_trgm, for trigram indexes. */
  queryTrigram: snapshot('snapshot_query_trigram_test_template', ['test-support/fixtures/query-ddl.ts'], async (db) => {
    await exec(db, 'create extension pg_trgm')
    await exec(db, queryDdl)
    await exec(db, 'vacuum analyze')
  }),
  /** The server tests' fixture (test-support/server.ts). */
  fixture: snapshot('snapshot_fixture_test_template', ['test-support/fixtures/server-ddl.ts'], async (db) => {
    await exec(db, serverDdl)
    await exec(db, 'vacuum analyze')
  }),
  /** A migrated Better Auth store with nothing in it: no users, no signing keys. */
  auth: snapshot('snapshot_auth_test_template', ['packages/server/src/auth', 'bun.lock'], async (_, url) => {
    const pool = new pg.Pool({ connectionString: url, max: 1 })
    const auth = createAuth({ database: { dialect: new PostgresDialect({ pool }), type: 'postgres' }, baseURL: 'http://localhost', secret: 'auth-store-snapshot-secret-0123456789', mailer: false })
    await (await getMigrations(auth.options)).runMigrations()
    await pool.end()
  }),
  /** The jobs schema, as `protobase migration` writes it. */
  jobs: snapshot('snapshot_jobs_test_template', ['packages/server/src/jobs'], async (db) => exec(db, (await jobsSchemaMigration(db))!)),
}

export type SnapshotTemplateKey = keyof typeof snapshotTemplates

/** Fills the template database at `url`. */
export const fillSnapshotTemplate = async (key: SnapshotTemplateKey, url: string) => {
  const db = new Kysely<any>({ dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: url, max: 1 }) }) })
  await snapshotTemplates[key].fill(db, url)
  await db.destroy()
}
