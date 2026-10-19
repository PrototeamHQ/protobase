import { describe, expect, it } from 'vitest'
import type { AnyField } from '../field'
import { f } from '../fields'
import { resource } from '../resource'

const orders = (fields: Record<string, AnyField>) =>
  resource('orders')
    .table('orders')
    .fields({ id: f.integer().readOnly(), quantity: f.integer(), price: f.decimal({ precision: 10, scale: 2 }), discount: f.decimal({ precision: 10, scale: 2 }).optional(), note: f.text(), ...fields })
    .primaryKey((r) => r.id)
    .toModel()

describe('rollup fields', () => {
  it('are read-only and carry their source and decimal', () => {
    const total = orders({ total: f.decimal({ precision: 12, scale: 2 }).rollup({ from: 'lines', via: 'order_id', fn: 'sum', field: 'amount' }) }).fields.total!
    expect(total).toMatchObject({ readOnly: true, rollup: { from: 'lines', via: 'order_id', fn: 'sum', field: 'amount' }, decimal: { precision: 12, scale: 2 } })
    expect(orders({ count: f.integer().rollup({ from: 'lines', via: 'order_id', fn: 'count' }) }).fields.count).not.toHaveProperty('decimal')
  })

  it('refuse a type or nullability their aggregate does not fit', () => {
    expect(() => orders({ total: f.text().rollup({ from: 'lines', via: 'order_id', fn: 'max', field: 'name' }) })).toThrow('rollup field "total" is text, not an integer, bigint or decimal')
    expect(() => orders({ total: f.decimal({ precision: 12, scale: 2 }).rollup({ from: 'lines', via: 'order_id', fn: 'count' }) })).toThrow('counts, so it is an integer or bigint')
    expect(() => orders({ total: f.integer().optional().rollup({ from: 'lines', via: 'order_id', fn: 'avg', field: 'amount' }) })).toThrow('takes an average, so it is a decimal')
    expect(() => orders({ total: f.integer().rollup({ from: 'lines', via: 'order_id', fn: 'max', field: 'amount' }) })).toThrow('must be optional(), as its max is empty without records')
    expect(() => orders({ total: f.integer().default(0).rollup({ from: 'lines', via: 'order_id', fn: 'count' }) })).toThrow('cannot have a default')
  })
})

describe('formula fields', () => {
  it('are read-only and carry their expression', () => {
    expect(orders({ amount: f.decimal({ precision: 12, scale: 2 }).formula('quantity * price') }).fields.amount).toMatchObject({ readOnly: true, formula: 'quantity * price', decimal: { precision: 12, scale: 2 } })
  })

  it('refuse an expression they cannot read', () => {
    expect(() => f.integer().formula('quantity ^ 2')).toThrow('unexpected "^"')
  })

  it('read only the number fields of the record that are no formulas', () => {
    expect(() => orders({ amount: f.integer().formula('missing * 2') })).toThrow('formula field "amount" reads "missing", which is not a field')
    expect(() => orders({ amount: f.integer().formula('amount * 2') })).toThrow('reads "amount", itself')
    expect(() => orders({ amount: f.integer().formula('note * 2') })).toThrow('reads "note", which is text, not a number')
    expect(() => orders({ a: f.integer().formula('quantity'), b: f.integer().formula('a + 1') })).toThrow('formula field "b" reads "a", which is a formula too')
    expect(() => orders({ amount: f.text().formula('quantity') })).toThrow('formula field "amount" is text')
  })

  it('are optional when a field they read is, unless coalesce() covers it', () => {
    expect(() => orders({ net: f.decimal({ precision: 12, scale: 2 }).formula('price - discount') })).toThrow('must be optional(), or coalesce() the optional fields it reads')
    expect(orders({ net: f.decimal({ precision: 12, scale: 2 }).formula('price - coalesce(discount, 0)') }).fields.net!.formula).toBe('price - coalesce(discount, 0)')
    expect(orders({ net: f.decimal({ precision: 12, scale: 2 }).optional().formula('price - discount') }).fields.net!.nullable).toBe(true)
  })
})
