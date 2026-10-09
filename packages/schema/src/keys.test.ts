import { describe, expect, it } from 'vitest'
import { decodeKey, encodeKey, keyTypes } from './keys'
import { resource } from './resource'
import { f } from './fields'

describe('key codec', () => {
  it('single keys are plain values', () => {
    expect(encodeKey(42)).toBe('42')
    expect(encodeKey('a,b%')).toBe('a,b%')
    expect(decodeKey('42', ['integer'])).toBe(42)
    expect(decodeKey('a,b%', ['text'])).toBe('a,b%')
    expect(decodeKey('', ['text'])).toBe('')
    expect(decodeKey('9007199254740993', ['bigint'])).toBe('9007199254740993')
    expect(decodeKey('0b5a4f0e-6f2a-4a3c-9d4e-1f2a3b4c5d6e', ['uuid'])).toBe(
      '0b5a4f0e-6f2a-4a3c-9d4e-1f2a3b4c5d6e',
    )
  })

  it('composite keys escape commas', () => {
    expect(encodeKey(['a,b', 'c'])).toBe('a%2Cb,c')
  })

  it.each([
    [['a,b', 'c']],
    [['100%', '%2C']],
    [['héllo ✓', '日本']],
    [['', '']],
    [['', 'x', '']],
  ])('round-trips text parts %j', (parts) => {
    const types = parts.map(() => 'text' as const)
    expect(decodeKey(encodeKey(parts), types)).toEqual(parts)
  })

  it('round-trips mixed types', () => {
    const parts = [7, '9223372036854775807', 'a,b']
    const decoded = decodeKey(encodeKey(parts), ['integer', 'bigint', 'text'])
    expect(decoded).toEqual(parts)
  })

  it('rejects bad input', () => {
    expect(() => decodeKey('x', ['integer'])).toThrow('Invalid integer')
    expect(() => decodeKey('', ['integer'])).toThrow('Invalid integer')
    expect(() => decodeKey('99999999999999999999', ['integer'])).toThrow('Invalid integer')
    expect(() => decodeKey('nope', ['uuid'])).toThrow('Invalid uuid')
    expect(() => decodeKey('1,2', ['integer', 'integer', 'integer'])).toThrow('Expected 3')
    expect(() => decodeKey('%E0,1', ['text', 'integer'])).toThrow('Malformed')
    expect(() => decodeKey('1', [])).toThrow('at least one')
  })

  it('derives key types from a resource model', () => {
    const model = resource('line')
      .table('lines')
      .fields({ orderId: f.integer(), sku: f.text(), qty: f.integer() })
      .primaryKey((r) => [r.orderId, r.sku])
      .toModel()
    expect(keyTypes(model)).toEqual(['integer', 'text'])
  })

  describe('relation key parts', () => {
    const orders = resource('orders').table('orders').fields({ id: f.bigint() }).primaryKey((r) => r.id).toModel()
    const lines = resource('orderLines')
      .table('order_lines')
      .fields({ orderId: f.relation('orders'), lineNo: f.integer() })
      .primaryKey((r) => [r.orderId, r.lineNo])
      .toModel()
    const resolve = (name: string) => [orders, lines].find((m) => m.name === name)

    it('uses the target resource key type', () => {
      expect(keyTypes(lines, resolve)).toEqual(['bigint', 'integer'])
      expect(decodeKey(encodeKey(['9007199254740993', 2]), keyTypes(lines, resolve))).toEqual(['9007199254740993', 2])
    })

    it('maps composite relation keys part by part', () => {
      const sku = resource('sku').table('sku').fields({ a: f.uuid(), b: f.text() }).primaryKey((r) => [r.a, r.b]).toModel()
      const stock = resource('stock')
        .table('stock')
        .fields({ sku: f.relation('sku').columns(['sku_a', 'sku_b']) })
        .primaryKey((r) => r.sku)
        .toModel()
      expect(keyTypes(stock, (n) => (n === 'sku' ? sku : undefined))).toEqual(['uuid', 'text'])
    })

    it('fails clearly without a resolver, for unknown targets and mismatched columns', () => {
      expect(() => keyTypes(lines)).toThrow('needs a resolver')
      expect(() => keyTypes(lines, () => undefined)).toThrow('Unknown resource "orders"')
      const wide = resource('w').table('w').fields({ o: f.relation('orders').columns(['a', 'b']) }).primaryKey((r) => r.o).toModel()
      expect(() => keyTypes(wide, resolve)).toThrow('2 column(s)')
    })
  })
})
