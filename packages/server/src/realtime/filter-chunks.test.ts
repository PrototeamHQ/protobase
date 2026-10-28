import { describe, expect, it } from 'vitest'
import { parseFilter, type FilterCondition } from './change-filter'
import { filterChunks, fitsOneQuery } from './filter-chunks'

const filter = (text: string) => parseFilter(text) as FilterCondition[]

describe('filterChunks', () => {
  it('splits the filters, in order, at the column limit', () => {
    const filters = Array.from({ length: 2001 }, (_, n) => filter(`id=eq.${n}`))
    const chunks = filterChunks(filters)
    expect(chunks.map((chunk) => chunk.length)).toEqual([1000, 1000, 1])
    expect(chunks.flat()).toEqual(filters.map((_, index) => index))
  })

  it('splits at the parameter limit, counting one per condition and none for is', () => {
    const limits = { columns: 10, parameters: 4 }
    expect(filterChunks([filter('a=eq.1,b=eq.2'), filter('a=eq.1,b=is.null'), filter('a=eq.1,b=eq.2')], limits)).toEqual([[0, 1], [2]])
    expect(filterChunks([filter('a=in.(1,2,3,4,5,6)'), filter('a=eq.1')], limits)).toEqual([[0, 1]])
    expect(filterChunks([], limits)).toEqual([])
  })

  it('throws for a filter that alone exceeds one query, which joins refuse first', () => {
    const huge = Array.from({ length: 60_001 }, (): FilterCondition => ({ column: 'a', operator: 'eq', value: '1', negate: false }))
    expect(fitsOneQuery(huge)).toBe(false)
    expect(fitsOneQuery(huge.slice(1))).toBe(true)
    expect(() => filterChunks([huge])).toThrow('A filter of 60001 parameters does not fit one query')
  })
})
