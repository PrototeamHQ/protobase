import { describe, expect, it } from 'vitest'
import { argumentsSchema } from './job-arguments'

describe('argumentsSchema', () => {
  it('checks each argument as a field of its type checks a value, and refuses other arguments', () => {
    const schema = argumentsSchema('send-invoice', { invoiceId: 'bigint', due: 'date', reminder: { type: 'integer', min: 1, optional: true }, period: { type: 'enum', values: ['day', 'week'] } })
    expect(schema.parse({ invoiceId: '42', due: '2026-11-01', period: 'day' })).toEqual({ invoiceId: '42', due: '2026-11-01', period: 'day' })
    expect(schema.safeParse({ invoiceId: 42, due: '2026-11-01', period: 'day' }).success).toBe(false)
    expect(schema.safeParse({ invoiceId: '42', due: '1 Nov', period: 'day' }).success).toBe(false)
    expect(schema.safeParse({ invoiceId: '42', due: '2026-11-01', period: 'month' }).success).toBe(false)
    expect(schema.safeParse({ invoiceId: '42', due: '2026-11-01', period: 'day', reminder: 0 }).success).toBe(false)
    expect(schema.safeParse({ invoiceId: '42', due: '2026-11-01', period: 'day', extra: true }).success).toBe(false)
  })

  it('names the job and the argument of a type that does not exist, or one that lacks an option it needs', () => {
    expect(() => argumentsSchema('nightly', { at: 'time' as never })).toThrow('Job "nightly": argument "at" has the type "time"')
    expect(() => argumentsSchema('price', { amount: 'decimal' })).toThrow('f.decimal requires precision and scale')
  })
})
