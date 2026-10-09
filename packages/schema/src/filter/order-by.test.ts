import { describe, expect, it } from 'vitest'
import { invoiceModel } from './fixtures'
import { checkOrderBy, parseOrderBy, printOrderBy } from './order-by'

const parsed = (source: string) => {
  const result = parseOrderBy(source)
  if (!result.ok) throw new Error(JSON.stringify(result.errors))
  return result.items
}

describe('order_by', () => {
  it('parses direction, whitespace and traversal', () => {
    expect(parsed('createdAt desc, total').map((i) => [i.path.path, i.direction])).toEqual([
      [['createdAt'], 'desc'],
      [['total'], 'asc'],
    ])
    expect(printOrderBy(parsed(' foo , bar   desc,baz asc '))).toBe('foo, bar desc, baz')
    expect(printOrderBy(parsed('a.b desc'))).toBe('a.b desc')
    expect(parsed('')).toEqual([])
  })

  it('print is stable', () => {
    const once = printOrderBy(parsed('createdAt  desc,total'))
    expect(printOrderBy(parsed(once))).toBe(once)
  })

  it('reports syntax errors with spans', () => {
    const result = parseOrderBy('a desc,, b up')
    expect(result.ok).toBe(false)
    expect(result.errors.map((e) => e.span.start)).toEqual([7, 11])
    expect(parseOrderBy('a desc,').errors[0]).toMatchObject({ code: 'expected-field' })
    expect(parseOrderBy('a b').errors[0]!.hint).toContain('desc')
  })

  it('accepts any case for asc and desc', () => {
    expect(printOrderBy(parsed('createdAt DESC, total Asc'))).toBe('createdAt desc, total')
    expect(parsed('createdAt DESC')[0]!.span).toEqual({ start: 0, end: 14 })
  })

  it('rejects traversal for now', () => {
    const result = checkOrderBy(invoiceModel, parsed('a.b desc'))
    expect(result.ok ? [] : result.errors.map((e) => e.code)).toEqual(['unsupported-traversal'])
  })

  it('checks against sortable fields and resolves aliases', () => {
    expect(checkOrderBy(invoiceModel, parsed('headline desc, createdAt'))).toEqual({
      ok: true,
      sort: [['title', 'desc'], ['createdAt', 'asc']],
    })
    const bad = checkOrderBy(invoiceModel, parsed('status, nope'))
    expect(bad.ok).toBe(false)
    expect(bad.ok ? [] : bad.errors.map((e) => e.code)).toEqual(['not-sortable', 'unknown-field'])
  })
})
