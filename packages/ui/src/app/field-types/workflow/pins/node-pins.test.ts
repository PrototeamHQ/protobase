import { describe, expect, it } from 'vitest'
import { fieldsOf } from './node-pins'

describe('fieldsOf', () => {
  it("lists a schema's fields, and a field several union branches declare once, taking any of their schemas", () => {
    expect(fieldsOf({ type: 'object', properties: { a: { type: 'string' } } })).toEqual([['a', { type: 'string' }]])
    expect(fieldsOf({ anyOf: [{ properties: { value: { type: 'string' }, unit: { type: 'string' } } }, { properties: { value: { type: 'integer' } } }] })).toEqual([
      ['value', { anyOf: [{ type: 'string' }, { type: 'integer' }] }],
      ['unit', { type: 'string' }],
    ])
    // Fields of its own and fields its branches add, together
    expect(fieldsOf({ properties: { common: { type: 'string' } }, anyOf: [{ properties: { left: { type: 'integer' } } }, { properties: { right: { type: 'integer' } } }] }).map(([name]) => name)).toEqual(['common', 'left', 'right'])
  })
})
