import { f, resource } from '@protobase/schema'

// A team's tasks: a list or task page someone has open shows a colleague's change within a second or two.

/** tasks */
export const tasks = resource('tasks')
  .table('tasks')
  .fields({
    id: f.integer().readOnly().filterable().sortable(),
    title: f.text(),
    status: f.enum(['todo', 'doing', 'done']).default('todo').filterable(),
  })
  .primaryKey((r) => r.id)
  .live()
