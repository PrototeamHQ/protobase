import { f, resource, view } from '@protobase/schema'

// A backlog for the related-dots stories: objectives, the tasks that serve them through a link table (a task can serve
// several), and the tasks' status coloured per value, so the dots of an objective turn green as its tasks get done,
// in the table and on the objectives' cards.

const objectives = resource('objectives')
  .table('objectives')
  .fields({ id: f.integer().readOnly().filterable().sortable(), title: f.text(), quarter: f.text() })
  .primaryKey((r) => r.id)

const tasks = resource('tasks')
  .table('tasks')
  .fields({ id: f.integer().readOnly().filterable().sortable(), title: f.text(), owner: f.text(), status: f.enum(['todo', 'doing', 'blocked', 'done']).filterable(), position: f.integer().sortable() })
  .primaryKey((r) => r.id)

const objectiveTasks = resource('objective_tasks')
  .table('objective_tasks')
  .fields({ objective_id: f.relation('objectives').filterable(), task_id: f.relation('tasks').filterable() })
  .primaryKey((r) => [r.objective_id, r.task_id])

const objectivesView = view<typeof objectives>('objectives')
  .title((r) => r.title)
  .names({ singular: 'Objective', plural: 'Objectives' })
  .list((r, d, c) => {
    const tasks = c.related('tasks', { resource: 'tasks', field: 'id', through: { resource: 'objective_tasks', field: 'objective_id', key: 'task_id' }, status: 'status', sort: 'position' })
    return { columns: [r.title, tasks, r.quarter], displays: [d.cards({ title: r.title, footer: [r.quarter], dots: [tasks] })] }
  })

const tasksView = view<typeof tasks>('tasks')
  .title((r) => r.title)
  .names({ singular: 'Task', plural: 'Tasks' })
  .fields((r) => ({ status: r.status.format('badge').valueLabels({ todo: 'To do', doing: 'Doing', blocked: 'Blocked', done: 'Done' }).valueColors({ doing: '#d97706', done: '#16a34a', blocked: '#dc2626' }) }))
  .list((r, d) => ({ columns: [r.title, r.owner, r.status], displays: [d.cards({ subtitle: r.owner, badge: r.status })] }))

export const objectiveResources = [objectives.toModel(), tasks.toModel(), objectiveTasks.toModel()]
export const objectiveViews = [objectivesView.toModel(objectives.toModel()), tasksView.toModel(tasks.toModel())]

const task = (id: number, title: string, owner: string, status: string) => ({ id, title, owner, status, position: id })

export const objectiveRows = {
  objectives: [
    { id: 1, title: 'Ship the objectives page', quarter: '2026 Q4' },
    { id: 2, title: 'Faster list pages', quarter: '2026 Q4' },
    { id: 3, title: 'Self-hosted runner', quarter: '2026 Q3' },
    { id: 4, title: 'Mobile record page', quarter: '2027 Q1' },
  ],
  tasks: [
    task(1, 'Link table for objectives', 'Ada', 'done'),
    task(2, 'Dots column', 'Bram', 'doing'),
    task(3, 'Card on hover', 'Bram', 'todo'),
    task(4, 'Docs for the column', 'Ada', 'todo'),
    task(5, 'Batch related loads', 'Cleo', 'done'),
    task(6, 'Profile the grid', 'Cleo', 'blocked'),
    task(7, 'Register the runner', 'Dex', 'done'),
    task(8, 'Route fm branches to it', 'Dex', 'done'),
  ],
  objective_tasks: [
    { objective_id: 1, task_id: 1 },
    { objective_id: 1, task_id: 2 },
    { objective_id: 1, task_id: 3 },
    { objective_id: 1, task_id: 4 },
    { objective_id: 2, task_id: 2 },
    { objective_id: 2, task_id: 5 },
    { objective_id: 2, task_id: 6 },
    { objective_id: 3, task_id: 7 },
    { objective_id: 3, task_id: 8 },
  ],
}
