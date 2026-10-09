import { describe, expect, it } from 'vitest'
import { checkFilter } from './check'
import { invoice, invoiceModel } from './fixtures'
import { parseFilter } from './parse'
import { printFilter } from './print'
import { stripSpans } from './strip-spans'
import { createWhere, where } from './where'

describe('where builder', () => {
  it('builds ASTs that print and parse back', () => {
    const ast = where.and(
      where.eq('status', 'paid'),
      where.in('status', ['paid', 'sent']),
      where.gt('total', '100'),
      where.or(where.lt('id', 5), where.not(where.isNull('createdAt'))),
      where.gt('createdAt', where.ago('30d')),
      where.search('hello "world"'),
    )
    const printed = printFilter(ast)
    expect(printed).toBe(
      'status = "paid" AND in(status, "paid", "sent") AND total > "100" AND (id < 5 OR NOT isNull(createdAt)) AND createdAt > now() - 30d AND search("hello \\"world\\"")',
    )
    expect(stripSpans(parseFilter(printed).ast)).toEqual(stripSpans(ast))
  })

  it('built filters pass the validator', () => {
    const w = createWhere<typeof invoice>()
    const ast = w.and(w.between('total', '10', '20'), w.eq('active', true), w.has('meta', 'k'), w.present('meta'))
    expect(checkFilter(invoiceModel, ast)).toMatchObject({ ok: true })
  })

  it('collapses single-argument groups and rejects empty ones', () => {
    const one = where.eq('a', 1)
    expect(where.and(one)).toBe(one)
    expect(() => where.or()).toThrow('at least one')
  })

  it('validates durations and numbers', () => {
    expect(() => where.ago('soon')).toThrow('Invalid duration')
    expect(() => where.eq('a', Infinity)).toThrow('finite')
  })

  it('is typed against a resource', () => {
    const w = createWhere<typeof invoice>()
    w.eq('status', 'paid')
    // @ts-expect-error unknown field
    w.eq('nope', 1)
    // @ts-expect-error not an enum member
    w.eq('status', 'gone')
    // @ts-expect-error integers take numbers
    w.eq('id', 'x')
    expect(true).toBe(true)
  })
})
