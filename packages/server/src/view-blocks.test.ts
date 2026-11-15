import { describe, expect, it } from 'vitest'
import { Card, Field, Thread } from '@protobase/layout'
import { f, l, resource, view } from '@protobase/schema'
import { checkRecordBlocks, withRecordBlocks } from './view-blocks'

const tasks = resource('tasks')
  .table('tasks')
  .fields({ id: f.integer().readOnly().filterable().sortable(), title: f.text(), owner_id: f.integer().filterable() })
  .primaryKey((r) => r.id)
const task_notes = resource('task_notes')
  .table('task_notes')
  .fields({ id: f.integer().readOnly().filterable().sortable(), task_id: f.relation('tasks').filterable(), noted_at: f.timestamp().sortable(), body: f.text() })
  .primaryKey((r) => r.id)

const models = { tasks: tasks.toModel(), task_notes: task_notes.toModel() }
const input = { models, actions: () => new Set<string>() }
const notes = Thread({ resource: 'task_notes', filter: 'task_id = {{@root.id}}', time: 'noted_at', text: 'body' })
const tasksView = (tree: Parameters<typeof l.blocks>[0]) => view<typeof tasks>('tasks').layout((r) => [l.section('Task', [r.title]), l.tab('Log', [l.blocks(tree)])]).toModel()

describe('checkRecordBlocks', () => {
  it("accepts a tree that reads the page's record, and fails on one that names a field it does not have", () => {
    expect(checkRecordBlocks([tasksView(Card({ title: '{{@root.title}}', children: notes }))], input)).toEqual([])
    expect(() => checkRecordBlocks([tasksView(Field({ source: 'titel' }))], input)).toThrow('View "tasks" blocks: <Field source="titel">: "titel" is no field of tasks (@root); did you mean title?')
  })
})

describe('withRecordBlocks', () => {
  const access = (hidden: string[]) => ({
    models: { ...models, task_notes: { ...models.task_notes, fields: Object.fromEntries(Object.entries(models.task_notes.fields).filter(([name]) => !hidden.includes(name))) } },
    permissions: {},
    actions: () => new Set<string>(),
  })

  it("gives each tree its caller's read plan", () => {
    const [, tab] = withRecordBlocks(tasksView(notes), access([])).layout
    expect(tab).toMatchObject({ kind: 'tab', items: [{ kind: 'blocks', reads: { reads: [{ resource: 'task_notes', filter: 'task_id = {{@root.id}}' }] } }] })
  })

  it('leaves out a tree the caller can read nothing of, and the tab it leaves empty', () => {
    expect(withRecordBlocks(tasksView(notes), access(['body'])).layout.map((item) => item.kind)).toEqual(['section'])
  })
})
