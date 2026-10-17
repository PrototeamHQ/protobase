import { describe, expect, it } from 'vitest'
import type { HistoryChange } from '@protobase/client'
import { f, resource, view } from '@protobase/schema'
import { changedBy, describeChange } from './describe-change'

const orders = resource('orders')
  .table('orders')
  .fields({ id: f.integer(), status: f.enum(['open', 'paid']), iban: f.text().optional().sensitive(), deleted_at: f.timestamp().optional() })
  .primaryKey((r) => r.id)
  .softDelete((r) => r.deleted_at)
const model = orders.toModel()
const ordersView = view<typeof orders>('orders').fields((r) => ({ status: r.status.label('State').valueLabels({ open: 'Open', paid: 'Paid' }) })).toModel()

const change = (extra: Partial<HistoryChange>): HistoryChange => ({ id: '1', at: '2026-10-17T10:00:00.000Z', operation: 'update', changed: [], actor: null, databaseRole: 'app', ...extra })

describe('changedBy', () => {
  it('names the user, else their id, else the database role', () => {
    expect(changedBy(change({ actor: { id: 'u1', name: 'Ada' } }))).toBe('Ada')
    expect(changedBy(change({ actor: { id: 'u1' } }))).toBe('u1')
    expect(changedBy(change({}))).toBe('Database (app)')
    expect(changedBy(change({ databaseRole: null }))).toBe('Database')
  })
})

describe('describeChange', () => {
  it('lists each changed field before and after as the view labels it, and a sensitive one without values', () => {
    const described = describeChange(
      change({ changed: ['status', 'iban', 'gone'], before: { id: 1, status: 'open' }, after: { id: 1, status: 'paid' }, actor: { id: 'u1', name: 'Ada' } }),
      model,
      ordersView,
    )
    expect(described).toEqual({ who: 'Ada', verb: 'changed', fields: [{ name: 'status', label: 'State', before: 'Open', after: 'Paid' }, { name: 'iban', label: 'Iban' }] })
  })

  it('says a record was created or deleted, without the soft delete field', () => {
    expect(describeChange(change({ operation: 'create', after: { id: 1 } }), model)).toEqual({ who: 'Database (app)', verb: 'created this', fields: [] })
    expect(describeChange(change({ operation: 'delete', changed: ['deleted_at'], before: {}, after: {} }), model).fields).toEqual([])
  })
})
