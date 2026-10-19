import { f, resource, view } from '@protobase/schema'

// A team's tasks on a board in the order of their rank, each card dragged to its place in a column or to another
// column, and the table in the same order, its rows dragged too.

export const tasks = resource('tasks')
  .table('tasks')
  .fields({
    id: f.integer().readOnly().filterable().sortable().dbDefault(),
    title: f.text(),
    status: f.enum(['todo', 'doing', 'done']).filterable().sortable(),
    rank: f.integer().sortable(),
  })
  .primaryKey((r) => r.id)
  .position((r) => r.rank)

export const tasksView = view<typeof tasks>('tasks')
  .title((r) => r.title)
  .list((r, d) => ({
    columns: [r.title, r.status],
    sort: [[r.rank, 'asc']],
    displays: [d.board({ by: r.status })],
    default: 'board',
    drag: { rank: true, board: true },
  }))
