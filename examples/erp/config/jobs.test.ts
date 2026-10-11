import { describe, expect, it } from 'vitest'
import type { WriteEvent } from '@protobase/server'
import { overdueCheck } from './jobs'

const event = (operation: WriteEvent['operation'], after?: Record<string, unknown>, resource = 'invoices') =>
  ({ operation, resource: { name: resource }, user: { id: 1, roles: [] }, ...(after && { after }) }) as unknown as WriteEvent

describe('overdueCheck', () => {
  it('checks a sent invoice the day after it is due, once per invoice', () => {
    expect(overdueCheck(event('update', { id: '42', status: 'sent', dueAt: '2026-11-01' }))).toEqual({
      invoiceId: '42',
      runAt: new Date('2026-11-02T00:00:00Z'),
      key: 'invoice:42',
    })
  })

  it('leaves drafts, paid invoices, deletes and other resources alone', () => {
    expect(overdueCheck(event('create', { id: '1', status: 'draft', dueAt: '2026-11-01' }))).toBeUndefined()
    expect(overdueCheck(event('update', { id: '1', status: 'paid', dueAt: '2026-11-01' }))).toBeUndefined()
    expect(overdueCheck(event('delete'))).toBeUndefined()
    expect(overdueCheck(event('update', { id: '1', status: 'sent' }, 'orders'))).toBeUndefined()
  })
})
