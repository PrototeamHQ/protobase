import { sql } from 'kysely'
import { describe, expect, it } from 'vitest'
import { compiled } from '../../../../test-support/compile-sql'
import { resolveShape } from './embed-shape'
import { joinsSql } from './embed-sql'
import type { ForeignKey } from './foreign-keys'
import { parseQuery } from './parse-query'
import { selectSql } from './shape-sql'

const foreignKeys: ForeignKey[] = [
  { name: 'todos_user_id_fkey', table: 'todos', columns: ['user_id'], foreignTable: 'profiles', foreignColumns: ['id'], unique: false },
  { name: 'comments_todo_id_fkey', table: 'comments', columns: ['todo_id'], foreignTable: 'todos', foreignColumns: ['id'], unique: false },
]

const shapeOf = (params: [string, string][]) => {
  const query = parseQuery(params)
  return resolveShape({ foreignKeys, served: (name) => sql.id(name), embedded: query.embedded }, 'todos', query.select)
}

describe('joinsSql and selectSql', () => {
  it('reads a to-one embed as its row\'s object and a to-many one as an array of its rows, filtered, sorted and paged', () => {
    const shape = shapeOf([['select', 'id,profiles(username),comments(id)'], ['comments.likes', 'gte.2'], ['comments.order', 'id.desc'], ['comments.limit', '1']])
    expect(compiled(selectSql('todos', shape)).sql).toBe('"todos"."id" as "id", "pgrst_profiles_1".body as "profiles", "pgrst_comments_2".body as "comments"')
    expect(compiled(joinsSql('todos', shape))).toEqual({
      sql: ' left join lateral (select row_to_json(pgrst_rows) as body from (select "profiles_1"."username" as "username" from "profiles" as "profiles_1" where "profiles_1"."id" = "todos"."user_id") as pgrst_rows) as "pgrst_profiles_1" on true'
        + ' left join lateral (select coalesce(json_agg(pgrst_rows), \'[]\') as body from (select "comments_2"."id" as "id" from "comments" as "comments_2" where "comments_2"."todo_id" = "todos"."id" and "comments_2"."likes" >= $1 order by "comments_2"."id" desc limit $2) as pgrst_rows) as "pgrst_comments_2" on true',
      parameters: ['2', 1],
    })
  })

  it('drops the rows without a related row for an inner embed, and shows nothing of an empty one', () => {
    const shape = shapeOf([['select', 'id,comments!inner()']])
    expect(compiled(selectSql('todos', shape)).sql).toBe('"todos"."id" as "id"')
    expect(compiled(joinsSql('todos', shape)).sql).toBe(' inner join lateral (select coalesce(json_agg(pgrst_rows), \'[]\') as body from (select  from "comments" as "comments_1" where "comments_1"."todo_id" = "todos"."id") as pgrst_rows having count(*) > 0) as "pgrst_comments_1" on true')
  })
})
