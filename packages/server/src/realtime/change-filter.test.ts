import { describe, expect, it } from 'vitest'
import { compiled } from '../../../../test-support/compile-sql'
import { filterSql, parseFilter } from './change-filter'

describe('parseFilter', () => {
  it('reads Supabase filters: an operator, not., in lists and several conditions', () => {
    expect(parseFilter(undefined)).toEqual([])
    expect(parseFilter(' ')).toEqual([])
    expect(parseFilter('user_id=eq.u1')).toEqual([{ column: 'user_id', operator: 'eq', value: 'u1', negate: false }])
    expect(parseFilter('id=not.in.(1,2)')).toEqual([{ column: 'id', operator: 'in', value: '{1,2}', negate: true }])
    expect(parseFilter('id=gt.0,name=eq."a,b"')).toEqual([
      { column: 'id', operator: 'gt', value: '0', negate: false },
      { column: 'name', operator: 'eq', value: 'a,b', negate: false },
    ])
    expect(parseFilter('done=is.null')).toEqual([{ column: 'done', operator: 'is', value: 'null', negate: false }])
  })

  it('refuses what Supabase refuses, with its message', () => {
    expect(parseFilter('id=in.1,2')).toBe('`in` filter value must be wrapped by parentheses')
    expect(parseFilter('id=eq.1,')).toBe('filter must not contain empty segments (check for extra commas)')
    expect(parseFilter('id=foo.1')).toBe('invalid filter "id=foo.1": unknown operator "foo"')
    expect(parseFilter('done=is.maybe')).toBe('invalid value for is filter: must be null, true, false, or unknown')
    expect(parseFilter('id')).toBe('invalid filter "id": use column=operator.value')
  })
})

describe('filterSql', () => {
  it('compares quoted columns with bound values, all conditions met and never null', () => {
    expect(compiled(filterSql('t', parseFilter('user_id=eq.u1,id=not.in.(1,2)') as never))).toEqual({
      sql: 'coalesce(t."user_id" = $1 and not (t."id" = any($2)), false)',
      parameters: ['u1', '{1,2}'],
    })
    expect(compiled(filterSql('k', parseFilter('done=is.true') as never))).toEqual({ sql: 'coalesce(k."done" is true, false)', parameters: [] })
    expect(compiled(filterSql('t', [])).sql).toBe('true')
  })

  it('quotes a column whatever it holds', () => {
    expect(compiled(filterSql('t', parseFilter('a"b=eq.1') as never)).sql).toBe('coalesce(t."a""b" = $1, false)')
  })
})
