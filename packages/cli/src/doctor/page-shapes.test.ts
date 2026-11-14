import { describe, expect, it } from 'vitest'
import { CardRow, Field, Page, RecordsIterator, ReferenceManyField, component, page } from '@protobase/layout'
import type { TableIndexes } from '@protobase/query'
import { f, resource } from '@protobase/schema'
import { indexIssues } from './index-issues'
import { pageShapes, unplannedBlocks } from './page-shapes'

const tasks = resource('tasks')
  .table('tasks')
  .fields({ id: f.integer().readOnly().filterable().sortable(), status: f.text().filterable(), title: f.text() })
  .primaryKey((r) => r.id)

const claims = resource('task_claims')
  .table('task_claims')
  .fields({ id: f.integer().readOnly().filterable().sortable(), task_id: f.integer().filterable(), claimed_at: f.timestamp().sortable() })
  .primaryKey((r) => r.id)

const models = { tasks: tasks.toModel(), task_claims: claims.toModel() }

const Clock = component('Clock')

const board = page(
  'board',
  Page({
    title: 'Board',
    children: [
      CardRow({
        title: 'Open',
        resource: 'tasks',
        filter: "status = 'open'",
        children: ReferenceManyField({ reference: 'task_claims', target: 'task_id', sort: 'claimed_at desc', perPage: 3, children: RecordsIterator({ children: Field({ source: 'claimed_at' }) }) }),
      }),
      Clock({}),
    ],
  }),
).toModel()

const btree = (name: string, ...columns: string[]) => ({ name, method: 'btree', partial: false, keys: columns.map((column) => ({ column, definition: column, opclass: 'int4_ops' })) })

describe('pageShapes', () => {
  const shapes = pageShapes(board, models, [])

  it("reads a nested list as its plan does, and the records its related() term ties it to with the outer list's own filter", () => {
    expect(shapes.map(({ resource, request, from }) => ({ resource, request, from }))).toEqual([
      { resource: 'tasks', request: 'GET /tasks?filter=status = "open"', from: 'page "board", <CardRow "Open">' },
      {
        resource: 'task_claims',
        request: 'GET /task_claims?filter=related(task_id, tasks.id, (status = "open"), "", 12)&order_by=claimed_at desc&limit_per=task_id:3',
        from: 'page "board", <ReferenceManyField>',
      },
      { resource: 'tasks', request: 'GET /tasks?filter=status = "open"', from: 'page "board", <ReferenceManyField> related tasks.id' },
    ])
  })

  it('reports the missing index of a nested read, and of the outer read it carries', () => {
    const none: TableIndexes = { kind: 'table', indexes: [btree('tasks_pkey', 'id')] }
    const claimed = indexIssues(models.task_claims, { kind: 'table', indexes: [btree('task_claims_pkey', 'id')] }, shapes)
    expect(claimed.map((issue) => issue.suggestion)).toEqual(['create index on "task_claims" ("task_id", "claimed_at");'])
    expect(claimed[0]!.message).toContain('page "board", <ReferenceManyField>')
    expect(indexIssues(models.tasks, none, shapes)[0]!.message).toContain('page "board", <ReferenceManyField> related tasks.id')
  })

  it('judges a filter whose page parameter fills an enum, number or timestamp field by a value that field takes', () => {
    const typed = resource('typed')
      .table('typed')
      .fields({ id: f.integer().readOnly().filterable().sortable(), state: f.enum(['open', 'done']).filterable(), at: f.timestamp().filterable() })
      .primaryKey((r) => r.id)
      .toModel()
    const tree = Page({ title: 'Typed', children: [CardRow({ resource: 'typed', filter: "state = '{{@params.state}}' AND id = {{@params.id}} AND at >= '{{@params.since}}'" })] })
    const shapes = pageShapes({ name: 'typed', title: 'Typed', tree }, { typed }, [])
    expect(shapes[0]!.query.filter).toMatchObject({ kind: 'and' })
  })

  it('lists a custom component without reads as outside the plan', () => {
    expect(unplannedBlocks(board, models)).toEqual(['page "board", <Clock>'])
  })
})
