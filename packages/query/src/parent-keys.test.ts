import { describe, expect, it } from 'vitest'
import { sql } from 'kysely'
import { f, resource } from '@protobase/schema'
import { compiled } from '../../../test-support/compile-sql'
import { encodeCursor } from './cursor'
import { parentCondition } from './read-conditions'
import { relatedPage } from './related-page'

const tasks = resource('tasks').table('tasks')
  .fields({ id: f.integer().sortable(), created_at: f.timestamp().sortable(), waits: f.json().optional().filterable() })
  .primaryKey((r) => r.id).toModel()
const claims = resource('claims').table('claims').fields({ id: f.integer(), task_id: f.relation('tasks') }).primaryKey((r) => r.id).toModel()

const term = (page?: ReturnType<typeof relatedPage>, items?: 'integer') => ({
  field: claims.fields.task_id!,
  parent: { model: tasks, key: items ? tasks.fields.waits! : tasks.fields.id!, ...(items && { items }), scope: {} },
  related: { model: tasks, ...(page && { page }) },
})
const text = (read: ReturnType<typeof term>) => compiled(sql`${parentCondition(read)}`)

describe("a related() term's page", () => {
  it('reads every parent without one, as today', () => {
    expect(text(term()).sql).toBe('"t"."task_id" in (select "t"."id" from "tasks" as "t")')
  })

  it('keeps to the parents its order and limit select, the key breaking ties', () => {
    const { sql: query, parameters } = text(term(relatedPage(tasks, { sort: [['created_at', 'desc']], limit: 2 })))
    expect(query).toBe('"t"."task_id" in (select "t"."id" from "tasks" as "t" order by "t"."created_at" desc, "t"."id" desc limit $1)')
    expect(parameters).toEqual([2])
  })

  it('caps the limit as a list caps its page size', () => {
    expect(text(term(relatedPage(tasks, { limit: 10_000 }))).parameters).toEqual([500])
  })

  it("starts after the token's row, as the list's next page does", () => {
    const keys = relatedPage(tasks, { sort: [['created_at', 'desc']] }).keys
    const cursor = encodeCursor(keys, ['2026-01-01 00:00:00+00', '7'])
    const { sql: query, parameters } = text(term(relatedPage(tasks, { sort: [['created_at', 'desc']], limit: 2, cursor })))
    expect(query).toBe('"t"."task_id" in (select "t"."id" from "tasks" as "t" where ("t"."created_at", "t"."id") < ($1, $2) order by "t"."created_at" desc, "t"."id" desc limit $3)')
    expect(parameters).toEqual(['2026-01-01 00:00:00+00', '7', 2])
  })

  it("refuses a token of another order, or one without the page's size", () => {
    const cursor = encodeCursor(relatedPage(tasks, {}).keys, ['7'])
    expect(() => relatedPage(tasks, { sort: [['created_at', 'desc']], limit: 2, cursor })).toThrow(/Cursor/)
    expect(() => relatedPage(tasks, { cursor })).toThrow(/page size/)
  })

  it('reads the items of a JSON list of keys, of the parents its page keeps', () => {
    const { sql: query } = text(term(relatedPage(tasks, { sort: [['created_at', 'desc']], limit: 2 }), 'integer'))
    expect(query).toBe(
      '"t"."task_id" in (select e.v::integer from (select "t"."waits" as k from "tasks" as "t" order by "t"."created_at" desc, "t"."id" desc limit $1) as p'
        + ` cross join lateral jsonb_array_elements_text(case when jsonb_typeof(p.k::jsonb) = 'array' then p.k::jsonb end) as e(v) where pg_input_is_valid(e.v, $2))`,
    )
  })
})
