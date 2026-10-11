import { createRequire } from 'node:module'
import { getConstructionPlans, getMigrationPlans } from 'pg-boss'
import { describe, expect, it } from 'vitest'
import { migrationStatements, pgBossSchemaVersion } from './schema'

describe('pgBossSchemaVersion', () => {
  it('is the schema version of the pg-boss installed, which a pg-boss bump must update', () => {
    const require = createRequire(import.meta.url)
    const { pgboss } = require('pg-boss/package.json') as { pgboss: { schema: number } }
    expect(pgBossSchemaVersion).toBe(pgboss.schema)
  })
})

describe('migrationStatements', () => {
  it("takes pg-boss's construction plan out of its own transaction", () => {
    const sql = migrationStatements(getConstructionPlans('jobs'))
    expect(sql).not.toMatch(/^\s*BEGIN;/m)
    expect(sql).not.toMatch(/^\s*COMMIT;/m)
    expect(sql).toMatch(/^SELECT pg_advisory_xact_lock\(/)
    expect(sql).not.toContain('SET LOCAL')
    expect(sql).toContain('CREATE SCHEMA IF NOT EXISTS jobs;')
    expect(sql).toContain(`INSERT INTO jobs.version(version) VALUES ('${pgBossSchemaVersion}');`)
  })

  it('builds the indexes of a migration plan in the transaction, never concurrently', () => {
    const plan = getMigrationPlans('jobs', pgBossSchemaVersion - 1)
    expect(plan).toContain('CREATE UNIQUE INDEX CONCURRENTLY')
    const sql = migrationStatements(plan)
    expect(sql).not.toMatch(/CONCURRENTLY/i)
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS job_common_i13 ON jobs.job_common')
    expect(sql).toContain(`UPDATE jobs.version SET version = '${pgBossSchemaVersion}';`)
  })

  it('refuses a plan in another shape', () => {
    expect(() => migrationStatements('CREATE TABLE x ()')).toThrow('Unexpected pg-boss plan')
  })
})
