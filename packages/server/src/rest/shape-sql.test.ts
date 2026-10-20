import { describe, expect, it } from 'vitest'
import { parseOrder } from './parse-order'
import { parseSelect } from './parse-select'
import { orderSql, rangeSql, selectSql } from './shape-sql'
import { compiled } from '../../../../test-support/compile-sql'

describe('selectSql', () => {
  it('names each field by its alias, its JSON path\'s last key or its column, and casts it', () => {
    expect(compiled(selectSql('todos', parseSelect('*,key:id,priority::text,meta->>cost')))).toEqual({
      sql: '"todos".*, "todos"."id" as "key", cast("todos"."priority" as text) as "priority", ("todos"."meta"->>$1::text) as "cost"',
      parameters: ['cost'],
    })
  })
})

describe('orderSql and rangeSql', () => {
  it('sorts by each term as given', () => {
    expect(compiled(orderSql('todos', parseOrder('priority.desc.nullslast,id'))).sql).toBe(' order by "todos"."priority" desc nulls last, "todos"."id"')
    expect(compiled(orderSql('todos', [])).sql).toBe('')
  })

  it('limits and skips with parameters, and leaves out what is not asked for', () => {
    expect(compiled(rangeSql({ offset: 2, limit: 5 }))).toEqual({ sql: ' limit $1 offset $2', parameters: [5, 2] })
    expect(compiled(rangeSql({ offset: 0 })).sql).toBe('')
  })
})
