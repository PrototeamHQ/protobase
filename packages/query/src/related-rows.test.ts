import { describe, expect, it } from 'vitest'
import { checkFilter, f, parseFilter, resource } from '@protobase/schema'
import { db } from '../../../test-support/compile-sql'
import { buildRelatedRows } from './related-rows'

const comments = resource('comments').table('comments')
  .fields({ id: f.integer().sortable(), task_id: f.integer().filterable(), kind: f.text().filterable(), created_at: f.timestamp().sortable() })
  .primaryKey((r) => r.id).toModel()
const checked = checkFilter(comments, parseFilter('kind = "note"').ast!)
if (!checked.ok) throw new Error('kind = "note" is a valid filter of comments')
const kind = checked.filter

describe('buildRelatedRows', () => {
  it("reads the values the filter keeps, each joined to its first rows in the read's order, by value", () => {
    const { sql, parameters } = buildRelatedRows(db, comments, { field: 'task_id', filter: kind, columns: ['id'], sort: [['created_at', 'desc']], limit: 2, total: 50 }).compile()
    expect(sql).toBe(
      'select "r".* from (select distinct "t"."task_id" as "__pb_owner" from "comments" as "t" where "t"."kind" = $1) as "k" '
      + 'inner join lateral (select "t"."task_id" as "task_id", "t"."id" as "id", row_number() over (order by "t"."created_at" desc, "t"."id" desc) as "__pb_rank" '
      + 'from "comments" as "t" where "t"."kind" = $2 and "t"."task_id" = "k"."__pb_owner" order by "t"."created_at" desc, "t"."id" desc limit $3) as "r" on true '
      + 'order by "k"."__pb_owner", "r"."__pb_rank" limit $4',
    )
    expect(parameters).toEqual(['note', 'note', 2, 50])
  })

  it('keeps to a given value list, and refuses a limit outside a page size', () => {
    expect(buildRelatedRows(db, comments, { field: 'task_id', values: [1, 2], columns: ['id'], limit: 1 }).compile().sql).toContain('"t"."task_id" in ($1, $2)')
    expect(() => buildRelatedRows(db, comments, { field: 'task_id', columns: ['id'], limit: 0 })).toThrow('limit must be a whole number from 1 to 500')
  })
})
