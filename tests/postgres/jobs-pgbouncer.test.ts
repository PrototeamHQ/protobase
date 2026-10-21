import { describe, vi } from 'vitest'
import { databaseUrl, poolerReachable, poolerUrl, serverReachable } from '../../scripts/test-db/templates'
import { useJobsDatabase } from '../jobs/jobs-database'
import { jobsScenarios } from '../jobs/jobs-scenarios'

// Workers poll and retry on real timers, which a busy machine stretches.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

// The job queue through PgBouncer in transaction mode as the cloud runs it: no LISTEN/NOTIFY, no session state, three
// server connections.
describe.skipIf(!(await serverReachable()) || !(await poolerReachable()))('jobs through PgBouncer in transaction mode', () => {
  const database = useJobsDatabase()
  jobsScenarios(() => databaseUrl(database, poolerUrl))
})
