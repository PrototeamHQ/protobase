import { describe, expect, it } from 'vitest'
import { arrayLiteral, filterSql, whereSql } from './filter-sql'
import { parseFilter } from './parse-filter'
import { compiled } from '../../../../test-support/compile-sql'

const condition = (key: string, value: string) => compiled(filterSql('todos', parseFilter(key, value)))

describe('filterSql', () => {
  it('compares a quoted column with a parameter', () => {
    expect(condition('priority', 'gte.2')).toEqual({ sql: '"todos"."priority" >= $1', parameters: ['2'] })
    expect(condition('done', 'not.eq.true')).toEqual({ sql: 'not ("todos"."done" = $1)', parameters: ['true'] })
    expect(condition('during', 'adj.[1,2)')).toEqual({ sql: '"todos"."during" -|- $1', parameters: ['[1,2)'] })
  })

  it('quotes a name whatever it holds, and binds a JSON path\'s keys', () => {
    expect(condition('a"b', 'eq.1').sql).toBe('"todos"."a""b" = $1')
    expect(condition('meta->a->>0', 'eq.x')).toEqual({ sql: '(("todos"."meta"->$1::text)->>$2::integer) = $3', parameters: ['a', 0, 'x'] })
  })

  it('turns stars into percent signs for like and ilike only', () => {
    expect(condition('title', 'ilike.*milk*').parameters).toEqual(['%milk%'])
    expect(condition('title', 'match.a*').parameters).toEqual(['a*'])
    expect(condition('title', 'like(any).{*a*,b*}')).toEqual({ sql: '"todos"."title" like any($1)', parameters: ['{%a%,b%}'] })
  })

  it('binds in as one array literal, and tests is by keyword', () => {
    expect(condition('id', 'in.(1,"2,3")')).toEqual({ sql: '"todos"."id" = any($1)', parameters: ['{"1","2,3"}'] })
    expect(condition('due', 'is.not_null')).toEqual({ sql: '"todos"."due" is not null', parameters: [] })
  })

  it('searches text with or without a language', () => {
    expect(condition('search', 'fts(english).milk')).toEqual({ sql: '"todos"."search" @@ to_tsquery($1, $2)', parameters: ['english', 'milk'] })
    expect(condition('search', 'phfts.the plumber')).toEqual({ sql: '"todos"."search" @@ phraseto_tsquery($1)', parameters: ['the plumber'] })
  })

  it('joins logic trees, negated as a whole', () => {
    expect(compiled(filterSql('todos', parseFilter('not.or', '(a.eq.1,and(b.eq.2,c.is.null))')))).toEqual({
      sql: 'not (("todos"."a" = $1 or ("todos"."b" = $2 and "todos"."c" is null)))',
      parameters: ['1', '2'],
    })
  })

  it('is nothing without filters, and joins several with and', () => {
    expect(compiled(whereSql('todos', [])).sql).toBe('')
    expect(compiled(whereSql('todos', [parseFilter('a', 'eq.1'), parseFilter('b', 'eq.2')])).sql).toBe(' where "todos"."a" = $1 and "todos"."b" = $2')
  })
})

describe('arrayLiteral', () => {
  it('quotes every value and escapes quotes and backslashes', () => {
    expect(arrayLiteral([])).toBe('{}')
    expect(arrayLiteral(['a b', 'say "hi"', 'c:\\d', 'NULL'])).toBe('{"a b","say \\"hi\\"","c:\\\\d","NULL"}')
  })
})
