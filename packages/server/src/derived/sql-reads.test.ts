import { parse } from 'libpg-query'
import { describe, expect, it } from 'vitest'
import { statementReads, UntrackedStatementError } from './sql-reads'

const reads = async (query: string, params: unknown[] = []) => ((await parse(query)).stmts ?? []).flatMap(({ stmt }) => statementReads(stmt as never, params))

describe('statementReads', () => {
  it('reads a get by key as that row of the table, and the columns it used', async () => {
    expect(await reads('select "title", "status" from "objectives" where "id" = $1', [7])).toEqual([
      { table: 'objectives', condition: { field: 'id', op: '=', value: 7 }, columns: ['id', 'status', 'title'] },
    ])
  })

  it('keeps a filter of comparisons, lists, null tests and their combinations', async () => {
    const [read] = await reads(`select count(*) from app.tasks where objective_id = $1 and (status in ('open', 'late') or due < $2::timestamptz) and closed_at is null and not done`, [3, new Date('2026-11-10T00:00:00Z')])
    expect(read).toEqual({
      schema: 'app',
      table: 'tasks',
      condition: {
        and: [
          { field: 'objective_id', op: '=', value: 3 },
          { or: [{ field: 'status', op: 'in', values: ['open', 'late'] }, { field: 'due', op: '<', value: '2026-11-10T00:00:00.000Z' }] },
          { field: 'closed_at', op: 'null' },
          { not: { field: 'done', op: '=', value: true } },
        ],
      },
      columns: ['closed_at', 'done', 'due', 'objective_id', 'status'],
    })
  })

  it('takes an array parameter of = any, constants either way round and between', async () => {
    const [read] = await reads('select id from tasks where id = any($1) and 5 < priority and size between 1 and 3', [[1, 2]])
    expect(read!.condition).toEqual({
      and: [
        { field: 'id', op: 'in', values: [1, 2] },
        { field: 'priority', op: '>', value: 5 },
        { and: [{ field: 'size', op: '>=', value: 1 }, { field: 'size', op: '<=', value: 3 }] },
      ],
    })
  })

  it('looks through casts that keep a value, and widens a cast column or a cast that changes the value', async () => {
    const [kept] = await reads(`select id from tasks where id = $1::int4 and owner = any($2::uuid[]) and title = 'a'::varchar`, ['7', ['a']])
    expect(kept!.condition).toEqual({ and: [{ field: 'id', op: '=', value: '7' }, { field: 'owner', op: 'in', values: ['a'] }, { field: 'title', op: '=', value: 'a' }] })
    const [changed] = await reads(`select id from tasks where created_at::date = $1::date and id = 7.5::int4 and title = 'abc'::varchar(2) and status = 'o'::task_status`, ['2026-11-10'])
    expect(changed!.condition).toEqual({ and: [{ maybe: true }, { maybe: true }, { maybe: true }, { maybe: true }] })
  })

  it('reads a table whose conditions cannot be worked out as every row', async () => {
    expect(await reads('select * from tasks where lower(title) like $1', ['a%'])).toEqual([{ table: 'tasks', condition: { maybe: true }, columns: null }])
    expect(await reads('select id from tasks')).toEqual([{ table: 'tasks', condition: { maybe: true }, columns: ['id'] }])
  })

  it('limits each joined table by its own conditions, and an outer join optional side only by its ON', async () => {
    const found = await reads(`select t.id from tasks t left join holds h on h.task_id = t.id and h.kind = 'x' where t.objective_id = $1 and h.id is null`, [3])
    expect(found).toEqual([
      { table: 'tasks', condition: { and: [{ field: 'objective_id', op: '=', value: 3 }, { maybe: true }] }, columns: ['id', 'objective_id'] },
      { table: 'holds', condition: { and: [{ maybe: true }, { field: 'kind', op: '=', value: 'x' }] }, columns: ['id', 'kind', 'task_id'] },
    ])
  })

  it('reads nested queries, WITH queries and both sides of a union, never a WITH name as a table', async () => {
    const found = await reads(`with open as (select id from tasks where status = 'open') select o.id from open o where exists (select 1 from holds h where h.task_id = o.id) union select id from goals where id = 1`)
    expect(found.map((read) => read.table).sort()).toEqual(['goals', 'holds', 'tasks'])
  })

  it('counts a whole row as every column', async () => {
    expect((await reads('select to_jsonb(t) from tasks t where t.id = 1'))[0]!.columns).toBeNull()
  })

  it('reads nothing of BEGIN and SET, and refuses a write', async () => {
    expect(await reads('begin; set local statement_timeout = 1000; commit')).toEqual([])
    await expect(reads('update tasks set done = true')).rejects.toThrow(UntrackedStatementError)
  })
})
