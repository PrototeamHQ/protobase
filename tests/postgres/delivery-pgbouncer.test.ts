import { describe, vi } from 'vitest'
import { poolerReachable, poolerUrl, serverReachable } from '../../scripts/test-db/templates'
import { freshDeliveryDatabases } from '../changes/delivery-database'
import { deliveryScenarios } from '../changes/delivery-scenarios'

// Deliveries send through node:http, whose requests the redelivery scenario counts.
vi.mock('node:http', async (original) => (await import('../changes/sent-requests')).recordingHttp(await original()))

// Workers poll and retry on real timers, which a busy machine stretches.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

// The actor setting, the dispatch job the trigger enqueues and the delivery jobs all go through the pooler.
describe.skipIf(!(await serverReachable()) || !(await poolerReachable()))('event delivery through PgBouncer in transaction mode', () => {
  deliveryScenarios(freshDeliveryDatabases(poolerUrl))
})
