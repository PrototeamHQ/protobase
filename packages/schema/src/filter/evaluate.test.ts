import { describe, expect, it } from 'vitest'
import { checkFilter } from './check'
import { evaluateFilter } from './evaluate'
import { invoiceModel } from './fixtures'
import { parseFilter } from './parse'

const now = () => new Date('2024-06-01T00:00:00Z')
const holds = (source: string, record: unknown) => {
  const parsed = parseFilter(source)
  if (!parsed.ok || !parsed.ast) throw new Error(JSON.stringify(parsed.errors))
  const checked = checkFilter(invoiceModel, parsed.ast)
  if (!checked.ok) throw new Error(JSON.stringify(checked.errors))
  return evaluateFilter(checked.filter, record, { now })
}

describe('evaluateFilter', () => {
  it('compares fields by canonical name, resolving aliases', () => {
    expect(holds('headline = "x"', { title: 'x' })).toBe(true)
    expect(holds('title = "*.foo"', { title: 'a.foo' })).toBe(true)
    expect(holds('id >= 5 AND id < 10', { id: 7 })).toBe(true)
    expect(holds('NOT (id = 7 OR id = 8)', { id: 9 })).toBe(true)
  })

  it('decimals and bigints compare exactly, as numbers or strings', () => {
    expect(holds('total > 100.49', { total: '100.50' })).toBe(true)
    expect(holds('total = "100.5"', { total: 100.5 })).toBe(true)
    expect(holds('views = 9007199254740993', { views: '9007199254740993' })).toBe(true)
    expect(holds('views < 9007199254740993', { views: '9007199254740992' })).toBe(true)
  })

  it('in, isNull, presence and enums', () => {
    expect(holds('in(status, "paid", "sent")', { status: 'sent' })).toBe(true)
    expect(holds('in(status, "paid", "sent")', { status: 'draft' })).toBe(false)
    expect(holds('in(id, 1, 2)', { id: 2 })).toBe(true)
    expect(holds('isNull(day)', {})).toBe(true)
    expect(holds('isNull(day)', { day: null })).toBe(true)
    expect(holds('isNull(day)', { day: '2024-01-01' })).toBe(false)
    expect(holds('day:*', { day: '2024-01-01' })).toBe(true)
  })

  it('timestamps, now() offsets and the injected clock', () => {
    expect(holds('createdAt > now() - 30d', { createdAt: '2024-05-20T00:00:00Z' })).toBe(true)
    expect(holds('createdAt > now() - 30d', { createdAt: new Date('2024-04-01T00:00:00Z') })).toBe(false)
    expect(holds('createdAt < now() + 1h', { createdAt: '2024-06-01T00:30:00Z' })).toBe(true)
    expect(holds('createdAt >= 2024-01-01T00:00:00Z', { createdAt: '2024-01-01T00:00:00Z' })).toBe(true)
  })

  it('regex runs on strings only', () => {
    expect(holds('regex(title, "^SO-")', { title: 'SO-1' })).toBe(true)
    expect(holds('regex(title, "^SO-")', { title: 'PO-1' })).toBe(false)
    expect(holds('regex(title, "^SO-")', { title: 5 })).toBe(false)
  })

  it('search and similar are not implemented without the database', () => {
    expect(() => holds('search("x")', { title: 'x' })).toThrow('Not implemented: search() needs the database')
    expect(() => holds('hello', {})).toThrow('Not implemented')
    expect(() => holds('similar(title, "x")', {})).toThrow('Not implemented: similar()')
  })
})
