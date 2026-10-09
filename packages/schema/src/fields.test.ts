import { describe, expect, it } from 'vitest'
import { fieldRegistry } from './field'
import { f } from './fields'

const ok = (field: { schema: { safeParse: (v: unknown) => { success: boolean } } }, v: unknown) =>
  field.schema.safeParse(v).success

describe('field schemas', () => {
  it('text with constraints', () => {
    const field = f.text().min(2).max(4).regex(/^[a-z]+$/, 'lowercase')
    expect(ok(field, 'abc')).toBe(true)
    expect(ok(field, 'a')).toBe(false)
    expect(ok(field, 'abcde')).toBe(false)
    expect(ok(field, 'AB')).toBe(false)
  })

  it('integer', () => {
    const field = f.integer().min(0).max(10)
    expect(ok(field, 5)).toBe(true)
    expect(ok(field, 1.5)).toBe(false)
    expect(ok(field, 11)).toBe(false)
    expect(ok(field, '5')).toBe(false)
  })

  it('bigint is a string within 64 bits', () => {
    const field = f.bigint()
    expect(ok(field, '9223372036854775807')).toBe(true)
    expect(ok(field, '-9223372036854775808')).toBe(true)
    expect(ok(field, '9223372036854775808')).toBe(false)
    expect(ok(field, 'abc')).toBe(false)
    expect(ok(field, 12)).toBe(false)
  })

  it('decimal respects precision and scale', () => {
    const field = f.decimal({ precision: 10, scale: 2 })
    expect(ok(field, '12345678.90')).toBe(true)
    expect(ok(field, '-0.5')).toBe(true)
    expect(ok(field, '.5')).toBe(true)
    expect(ok(field, '123456789.0')).toBe(false)
    expect(ok(field, '1.234')).toBe(false)
    expect(ok(field, '')).toBe(false)
    expect(ok(field, '.')).toBe(false)
    expect(ok(field, 1.5)).toBe(false)
  })

  it('boolean, date, timestamp, uuid', () => {
    expect(ok(f.boolean(), true)).toBe(true)
    expect(ok(f.boolean(), 'true')).toBe(false)
    expect(ok(f.date(), '2026-02-28')).toBe(true)
    expect(ok(f.date(), '2026-02-30')).toBe(false)
    expect(ok(f.timestamp(), '2026-02-28T10:00:00Z')).toBe(true)
    expect(ok(f.timestamp(), '2026-02-28T10:00:00+02:00')).toBe(true)
    expect(ok(f.timestamp(), '2026-02-28')).toBe(false)
    expect(ok(f.uuid(), '0b5a4f0e-6f2a-4a3c-9d4e-1f2a3b4c5d6e')).toBe(true)
    expect(ok(f.uuid(), 'nope')).toBe(false)
  })

  it('enum, json, relation, currency, country', () => {
    const status = f.enum(['draft', 'live'])
    expect(ok(status, 'live')).toBe(true)
    expect(ok(status, 'gone')).toBe(false)
    expect(ok(f.json(), { a: [1, null] })).toBe(true)
    expect(ok(f.json(), undefined)).toBe(false)
    expect(ok(f.relation('customer'), 4)).toBe(true)
    expect(ok(f.relation('customer'), 'x')).toBe(true)
    expect(ok(f.relation('customer'), 1.5)).toBe(false)
    expect(ok(f.currency(), 'EUR')).toBe(true)
    expect(ok(f.currency(), 'eur')).toBe(false)
    expect(ok(f.country(), 'NL')).toBe(true)
    expect(ok(f.country(), 'NLD')).toBe(false)
  })

  it('optional allows null, default fills undefined', () => {
    expect(ok(f.text().optional(), null)).toBe(true)
    expect(ok(f.text(), null)).toBe(false)
    expect(f.integer().default(3).schema.parse(undefined)).toBe(3)
  })
})

describe('field metadata', () => {
  it('is immutable and defaults to not filterable or sortable', () => {
    const base = f.text()
    const chained = base.column('t').readOnly().alias('a', 'b').alias('c').filterable().sortable()
    expect(base.meta).toMatchObject({ filterable: false, sortable: false, readOnly: false, aliases: [] })
    expect(chained.meta).toMatchObject({
      column: 't',
      readOnly: true,
      aliases: ['a', 'b', 'c'],
      filterable: true,
      sortable: true,
    })
  })

  it('registers metadata in the zod registry', () => {
    const field = f.integer().filterable()
    expect(fieldRegistry.get(field.schema)).toBe(field.meta)
  })

  it('rejects unsupported constraints and invalid definitions', () => {
    expect(() => f.boolean().min(1)).toThrow('does not support .min()')
    expect(() => f.enum([])).toThrow('at least one value')
    expect(() => f.decimal({} as never)).toThrow('precision and scale')
  })

  it('relation columns', () => {
    expect(f.relation('order').columns(['order_id', 'tenant_id']).meta.relation).toEqual({
      resource: 'order',
      columns: ['order_id', 'tenant_id'],
    })
  })
})
