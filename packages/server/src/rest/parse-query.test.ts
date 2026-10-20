import { describe, expect, it } from 'vitest'
import { parseQuery } from './parse-query'

describe('parseQuery', () => {
  it('takes select, order, limit, offset, on_conflict and columns, and every other parameter as a filter', () => {
    const query = parseQuery([['select', 'id'], ['priority', 'eq.1'], ['order', 'id.desc'], ['limit', '2'], ['offset', '3'], ['on_conflict', 'username'], ['columns', '"title","done"'], ['or', '(a.eq.1)']])
    expect(query).toMatchObject({ select: [{ kind: 'field' }], order: [{ direction: 'desc' }], range: { offset: 3, limit: 2 }, onConflict: ['username'], columns: ['title', 'done'] })
    expect(query.filters.map((filter) => filter.kind)).toEqual(['condition', 'or'])
  })

  it('leaves a function\'s arguments out of the filters', () => {
    expect(parseQuery([['a', '1'], ['b', 'eq.2']], null, new Set(['a'])).filters).toHaveLength(1)
  })

  it('reads the Range header, narrowed by limit and offset', () => {
    expect(parseQuery([], '2-4').range).toEqual({ offset: 2, limit: 3 })
    expect(parseQuery([], '5-').range).toEqual({ offset: 5 })
    expect(parseQuery([['limit', '2']], '1-9').range).toEqual({ offset: 1, limit: 1 })
    expect(parseQuery([['offset', '3']], '0-4').range).toEqual({ offset: 3, limit: 2 })
    expect(parseQuery([], 'bytes=1-2').range).toEqual({ offset: 0 })
  })

  it('refuses a limit or offset that is no whole number', () => {
    expect(() => parseQuery([['limit', '-1']])).toThrow()
    expect(() => parseQuery([['offset', 'x']])).toThrow()
  })
})
