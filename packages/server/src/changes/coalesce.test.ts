import { describe, expect, it } from 'vitest'
import { coalesce, type CapturedRow } from './coalesce'

let id = 0
const row = (op: CapturedRow['op'], old: Record<string, unknown> | null, next: Record<string, unknown> | null, extra: Partial<CapturedRow> = {}): CapturedRow => ({
  id: String(++id),
  transaction: '700',
  resource: 'orders',
  op,
  old,
  new: next,
  changed: op === 'UPDATE' ? Object.keys(next ?? {}).filter((key) => old?.[key] !== next?.[key]) : null,
  actor: null,
  ...extra,
})

const keyColumns = () => ['id']

describe('coalesce', () => {
  it('makes one change per transaction and record, before as at the start and after as at commit', () => {
    const changes = coalesce(
      [
        row('INSERT', null, { id: 1, total: 0 }),
        row('UPDATE', { id: 1, total: 0 }, { id: 1, total: 1200 }),
        row('INSERT', null, { id: 2, total: 50 }),
        row('UPDATE', { id: 3, total: 5 }, { id: 3, total: 6 }, { transaction: '701' }),
        row('UPDATE', { id: 3, total: 6 }, { id: 3, total: 7 }, { transaction: '701' }),
      ],
      keyColumns,
    )
    expect(changes.map(({ transaction, before, after, changed }) => ({ transaction, before, after, changed }))).toEqual([
      { transaction: '700', before: null, after: { id: 1, total: 1200 }, changed: [] },
      { transaction: '700', before: null, after: { id: 2, total: 50 }, changed: [] },
      { transaction: '701', before: { id: 3, total: 5 }, after: { id: 3, total: 7 }, changed: ['total'] },
    ])
    expect(changes.map((change) => change.sequence)).toEqual([String(id - 3), String(id - 2), String(id)])
  })

  it('drops an insert then delete, and an update that ends where it started', () => {
    expect(coalesce([row('INSERT', null, { id: 1 }), row('DELETE', { id: 1 }, null)], keyColumns)).toEqual([])
    expect(coalesce([row('UPDATE', { id: 1, total: 1 }, { id: 1, total: 2 }), row('UPDATE', { id: 1, total: 2 }, { id: 1, total: 1 })], keyColumns)).toEqual([])
  })

  it('keeps a changed sensitive column, which the rows never hold', () => {
    const [change] = coalesce([row('UPDATE', { id: 1, total: 1 }, { id: 1, total: 1 }, { changed: ['iban'] })], keyColumns)
    expect(change!.changed).toEqual(['iban'])
  })

  it('makes an update of a delete then an insert of the same key, and a delete of an update then a delete', () => {
    const [replaced] = coalesce([row('DELETE', { id: 1, total: 1 }, null), row('INSERT', null, { id: 1, total: 2 })], keyColumns)
    expect([replaced!.before, replaced!.after, replaced!.changed]).toEqual([{ id: 1, total: 1 }, { id: 1, total: 2 }, ['total']])
    const [removed] = coalesce([row('UPDATE', { id: 1, total: 1 }, { id: 1, total: 2 }), row('DELETE', { id: 1, total: 2 }, null)], keyColumns)
    expect([removed!.before, removed!.after]).toEqual([{ id: 1, total: 1 }, null])
  })

  it('follows a record whose key an update changed', () => {
    const changes = coalesce([row('UPDATE', { id: 1, total: 1 }, { id: 9, total: 1 }), row('UPDATE', { id: 9, total: 1 }, { id: 9, total: 2 })], keyColumns)
    expect(changes).toHaveLength(1)
    expect([changes[0]!.before, changes[0]!.after]).toEqual([{ id: 1, total: 1 }, { id: 9, total: 2 }])
  })

  it('tells records of different resources and composite keys apart, and keeps the actor', () => {
    const actor = { id: 'u1', roles: ['sales'] }
    const changes = coalesce(
      [
        row('INSERT', null, { order_id: 1, sku: 'a' }, { resource: 'lines', actor }),
        row('INSERT', null, { order_id: 1, sku: 'b' }, { resource: 'lines', actor }),
        row('INSERT', null, { id: 1 }, { actor }),
      ],
      (resource) => (resource === 'lines' ? ['order_id', 'sku'] : ['id']),
    )
    expect(changes.map((change) => [change.resource, change.after, change.actor])).toEqual([
      ['lines', { order_id: 1, sku: 'a' }, actor],
      ['lines', { order_id: 1, sku: 'b' }, actor],
      ['orders', { id: 1 }, actor],
    ])
  })
})
