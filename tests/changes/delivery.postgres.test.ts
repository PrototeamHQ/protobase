import { describe, vi } from 'vitest'
import { serverReachable } from '../../scripts/test-db/templates'
import { freshDeliveryDatabases } from './delivery-database'
import { deliveryScenarios } from './delivery-scenarios'

// Workers poll and retry on real timers, which a busy machine stretches.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

// Through PgBouncer it runs in the Postgres suite (tests/postgres).
describe.skipIf(!(await serverReachable()))('event delivery on Postgres', () => {
  deliveryScenarios(freshDeliveryDatabases())
})
