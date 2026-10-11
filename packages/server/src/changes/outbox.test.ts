import { describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { parseColumns } from './outbox'

const model = resource('ledger')
  .table('ledger')
  .fields({ id: f.bigint(), amount: f.decimal({ precision: 20, scale: 2 }), lines: f.integer(), meta: f.json().optional() })
  .primaryKey((r) => r.id)
  .toModel()

describe('parseColumns', () => {
  it('keeps every digit of 64-bit integers and decimals, and other numbers as numbers', () => {
    expect(parseColumns('{"id": 9007199254740993, "amount": 1200.50, "lines": 3, "meta": {"n": 1.50}, "other": 7}', model)).toEqual({
      id: '9007199254740993',
      amount: '1200.50',
      lines: 3,
      meta: { n: 1.5 },
      other: 7,
    })
  })

  it('is null for no row, and plain numbers without a model', () => {
    expect(parseColumns(null, model)).toBeNull()
    expect(parseColumns('{"id": 1}')).toEqual({ id: 1 })
  })
})
