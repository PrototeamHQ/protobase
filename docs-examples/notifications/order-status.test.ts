import { describe, expect, it } from 'vitest'
import type { SubscriptionEvent } from '@protobase/server'
import { orderStatusToOwner } from './order-status'

// The notifications guide shows this file; this keeps what it says about it true.

const changed = (after: Record<string, unknown>) => ({
  id: 'evt_1_statusChanged', type: 'orders.statusChanged', timestamp: '2026-10-25T09:00:00.000Z',
  data: { resource: 'orders', operation: 'update', key: '0192f6a0-0000-7000-8000-000000000001', sequence: '1', after, changed: ['status'], actor: null, source: 'api', transaction: '1' },
}) as SubscriptionEvent

const run = (event: SubscriptionEvent) => {
  if (!('run' in orderStatusToOwner.options)) throw new Error('orderStatusToOwner runs code')
  return orderStatusToOwner.options.run(event, { db: {} as never, attempt: 1, signal: new AbortController().signal })
}

describe('the order status subscription', () => {
  it('listens to the status changes of orders', () => {
    expect(orderStatusToOwner.options.events).toEqual(['orders.statusChanged'])
  })

  // A send is checked before it is queued, so one that gets as far as the jobs runtime, which only the app runs, is valid.
  it('sends a valid notification to the owner', async () => {
    await expect(run(changed({ number: 'SO-1', owner_id: 3, status: 'shipped' }))).rejects.toThrow('Jobs are not running in this process')
  })

  it('sends nothing for an order without an owner', async () => {
    await expect(run(changed({ number: 'SO-1', owner_id: null, status: 'shipped' }))).resolves.toBeUndefined()
  })
})
