import { describe, vi } from 'vitest'
import { serverReachable } from '../../scripts/test-db/templates'
import { freshDeliveryDatabases } from './delivery-database'
import { deliveryScenarios } from './delivery-scenarios'

// Deliveries send through node:http, whose requests the redelivery scenario counts.
vi.mock('node:http', async (original) => (await import('./sent-requests')).recordingHttp(await original()))

// Workers poll and retry on real timers, which a busy machine stretches.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

// Through PgBouncer it runs in the Postgres suite (tests/postgres).
describe.skipIf(!(await serverReachable()))('event delivery on Postgres', () => {
  deliveryScenarios(freshDeliveryDatabases())
})
