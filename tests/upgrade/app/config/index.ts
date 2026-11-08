import { f, resource } from '@protobase/schema'

/** work.projects: the change capture, history, comments and a rollup of its tasks. */
export const projects = resource('projects')
  .table('work.projects')
  .fields({
    id: f.integer().readOnly().filterable().sortable().dbDefault(),
    organization_id: f.integer().filterable().sortable(),
    name: f.text(),
    open_tasks: f.integer().rollup({ from: 'tasks', via: 'project_id', fn: 'count' }),
  })
  .primaryKey((r) => r.id)
  .tenant((r) => r.organization_id)
  .events((e) => e.crud())
  .history()
  .comments()

/** work.tasks: a formula field. */
export const tasks = resource('tasks')
  .table('work.tasks')
  .fields({
    id: f.integer().readOnly().filterable().sortable().dbDefault(),
    organization_id: f.integer().filterable().sortable(),
    project_id: f.relation('projects').filterable().sortable(),
    title: f.text(),
    hours: f.decimal({ precision: 6, scale: 2 }),
    days: f.decimal({ precision: 6, scale: 2 }).formula('round(hours / 8, 2)'),
  })
  .primaryKey((r) => r.id)
  .tenant((r) => r.organization_id)
