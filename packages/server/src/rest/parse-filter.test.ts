import { describe, expect, it } from 'vitest'
import { parseFilter } from './parse-filter'
import { RestError } from './rest-error'

const column = (name: string) => ({ column: name, json: [] })

const refusal = (key: string, value: string) => {
  const error = (() => {
    try {
      parseFilter(key, value)
    } catch (thrown) {
      return thrown
    }
  })()
  expect(error).toBeInstanceOf(RestError)
  return (error as RestError).body.code
}

describe('parseFilter', () => {
  it('reads an operator and the rest as the value, dots and all', () => {
    expect(parseFilter('due', 'gte.2026-03-02')).toEqual({ kind: 'condition', field: column('due'), negated: false, operator: 'gte', value: '2026-03-02' })
    expect(parseFilter('site', 'eq.a.b.c')).toMatchObject({ operator: 'eq', value: 'a.b.c' })
    expect(parseFilter('title', 'like.*milk*')).toMatchObject({ operator: 'like', value: '*milk*' })
  })

  it('reads not., a JSON path and every operator', () => {
    expect(parseFilter('done', 'not.eq.true')).toMatchObject({ negated: true, operator: 'eq', value: 'true' })
    expect(parseFilter('meta->a->>kind', 'eq.work')).toMatchObject({ field: { column: 'meta', json: [{ arrow: '->', key: 'a' }, { arrow: '->>', key: 'kind' }] } })
    expect(parseFilter('tags->0', 'eq."x"')).toMatchObject({ field: { column: 'tags', json: [{ arrow: '->', key: 0 }] } })
    for (const operator of ['neq', 'gt', 'lt', 'lte', 'ilike', 'match', 'imatch', 'isdistinct', 'cs', 'cd', 'ov', 'sl', 'sr', 'nxr', 'nxl', 'adj']) {
      expect(parseFilter('x', `${operator}.1`)).toMatchObject({ operator, value: '1' })
    }
  })

  it('reads in as a list, quoted values with commas and escapes, and nothing as no values', () => {
    expect(parseFilter('title', 'in.("Buy milk","a,b",x,"say \\"hi\\"")')).toMatchObject({ value: ['Buy milk', 'a,b', 'x', 'say "hi"'] })
    expect(parseFilter('id', 'in.()')).toMatchObject({ value: [] })
    expect(refusal('id', 'in.1,2')).toBe('PGRST100')
  })

  it('reads is with its fixed values only', () => {
    for (const value of ['null', 'not_null', 'true', 'false', 'unknown']) expect(parseFilter('done', `is.${value}`)).toMatchObject({ operator: 'is', value })
    expect(refusal('done', 'is.maybe')).toBe('PGRST100')
  })

  it('reads a language for text search and any or all for comparisons, and no other modifier', () => {
    expect(parseFilter('search', 'fts(english).milk & buy')).toMatchObject({ operator: 'fts', language: 'english', value: 'milk & buy' })
    expect(parseFilter('search', 'wfts.milk -bread')).toMatchObject({ operator: 'wfts', value: 'milk -bread' })
    expect(parseFilter('priority', 'eq(any).{1,3}')).toMatchObject({ quantifier: 'any', value: '{1,3}' })
    expect(parseFilter('title', 'like(all).{*a*,*b*}')).toMatchObject({ operator: 'like', quantifier: 'all' })
    expect(refusal('title', 'neq(any).{1}')).toBe('PGRST100')
    expect(refusal('title', 'eq(english).x')).toBe('PGRST100')
  })

  it('refuses an unknown operator or a value without one', () => {
    expect(refusal('id', 'near.1')).toBe('PGRST100')
    expect(refusal('id', '1')).toBe('PGRST100')
    expect(refusal('->a', 'eq.1')).toBe('PGRST100')
  })

  it('reads logic trees, nested, negated, with quoted values, lists and arrays', () => {
    expect(parseFilter('or', '(title.eq."Buy, milk",and(priority.gte.3,done.not.is.true),not.and(tags.cs.{code,work},id.in.(1,2)))')).toEqual({
      kind: 'or',
      negated: false,
      args: [
        { kind: 'condition', field: column('title'), negated: false, operator: 'eq', value: 'Buy, milk' },
        {
          kind: 'and',
          negated: false,
          args: [
            { kind: 'condition', field: column('priority'), negated: false, operator: 'gte', value: '3' },
            { kind: 'condition', field: column('done'), negated: true, operator: 'is', value: 'true' },
          ],
        },
        {
          kind: 'and',
          negated: true,
          args: [
            { kind: 'condition', field: column('tags'), negated: false, operator: 'cs', value: '{code,work}' },
            { kind: 'condition', field: column('id'), negated: false, operator: 'in', value: ['1', '2'] },
          ],
        },
      ],
    })
    expect(parseFilter('not.and', '(a.eq.1)')).toMatchObject({ kind: 'and', negated: true })
    expect(parseFilter('or', '(meta->>kind.eq.work)')).toMatchObject({ args: [{ field: { column: 'meta', json: [{ arrow: '->>', key: 'kind' }] } }] })
  })

  it('refuses a logic tree without parentheses, an unclosed one, or an item without an operator', () => {
    expect(refusal('or', 'a.eq.1,b.eq.2')).toBe('PGRST100')
    expect(refusal('or', '(a.eq.1,and(b.eq.2)')).toBe('PGRST100')
    expect(refusal('or', '(a.eq."x)')).toBe('PGRST100')
    expect(refusal('or', '(a)')).toBe('PGRST100')
  })
})
