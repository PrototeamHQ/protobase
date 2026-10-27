import type { ResourceModel } from '@protobase/schema'
import { describe, expect, it } from 'vitest'
import { echoFieldsOf, writeEcho } from './write-echo'

const lines = {
  name: 'order_lines',
  primaryKey: ['order_id', 'line'],
  fields: {
    order_id: { name: 'order_id', readOnly: false },
    line: { name: 'line', readOnly: false },
    qty: { name: 'qty', readOnly: false },
    total: { name: 'total', readOnly: true },
    created_at: { name: 'created_at', readOnly: true },
    approved_by: { name: 'approved_by', readOnly: true },
  },
} as unknown as ResourceModel

const record = { order_id: 3, line: 2, qty: 4, total: 40, created_at: '2026-10-27', approved_by: null, note: 'Long' }

describe('writeEcho', () => {
  it('gives a composite key as its parts, the written fields and the read-only fields that changed', () => {
    const before = { ...record, qty: 1, total: 10 }
    expect(writeEcho(lines, { record, etag: '"v2"' }, { qty: 4 }, before, [])).toEqual({ key: [3, 2], etag: '"v2"', record: { qty: 4, total: 40 } })
  })

  it('counts a read-only field the caller could not read before as changed', () => {
    const { total: _total, ...before } = record
    expect(writeEcho(lines, { record, etag: '"v2"' }, { qty: 4 }, before, []).record).toEqual({ qty: 4, total: 40 })
  })

  it('gives a create the read-only fields that have a value', () => {
    expect(writeEcho(lines, { record, etag: '"v1"' }, { order_id: 3, qty: 4 }, undefined, []).record).toEqual({ order_id: 3, qty: 4, total: 40, created_at: '2026-10-27' })
  })

  it('adds the fields asked for, skips those the record does not have, and gives it all for *', () => {
    expect(writeEcho(lines, { record, etag: '"v2"' }, { qty: 4 }, record, ['note', 'secret']).record).toEqual({ qty: 4, note: 'Long' })
    expect(writeEcho(lines, { record, etag: '"v2"' }, { qty: 4 }, record, ['*']).record).toEqual(record)
  })

  it('leaves the key and read-only fields out without the resource\'s model', () => {
    expect(writeEcho(undefined, { record, etag: '"v1"' }, { qty: 4 }, undefined, [])).toEqual({ etag: '"v1"', record: { qty: 4 } })
  })
})

describe('echoFieldsOf', () => {
  it('takes a list of names, absent being none, and nothing else', () => {
    expect(echoFieldsOf(undefined)).toEqual([])
    expect(echoFieldsOf(['qty', '*'])).toEqual(['qty', '*'])
    for (const value of ['qty', [''], [1], null]) expect(echoFieldsOf(value)).toBeUndefined()
  })
})
