import { describe, vi } from 'vitest'
import { databaseUrl, serverReachable } from '../../scripts/test-db/templates'
import { useJobsDatabase } from './jobs-database'
import { jobsScenarios } from './jobs-scenarios'

// Workers poll and retry on real timers, which a busy machine stretches.
vi.setConfig({ testTimeout: 30_000 })

// The job queue on a real Postgres. Through PgBouncer it runs in the Postgres suite (tests/postgres).
describe.skipIf(!(await serverReachable()))('jobs on Postgres', () => {
  const database = useJobsDatabase()
  jobsScenarios(() => databaseUrl(database))
})
