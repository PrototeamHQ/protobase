import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, within } from 'storybook/test'
import { createStaticSession } from '@protobase/client'
import { compileReadPlan, Thread, type LayoutNode } from '@protobase/layout'
import { f, l, resource, view, type LayoutItemModel, type ViewModel } from '@protobase/schema'
import { App } from '../../app'
import { fakeApi } from '../../testing/fake-api'

const meta = { title: 'Record page/Block tree', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'story', email: 'story@example.test', name: 'Story User', role: 'admin' })

// A task's log in a tab of its record page: a block tree reading the task as @root, a thread of one author's notes

const tasks = resource('tasks')
  .table('tasks')
  .fields({ id: f.integer().readOnly().filterable().sortable(), title: f.text(), status: f.text() })
  .primaryKey((r) => r.id)

const task_notes = resource('task_notes')
  .table('task_notes')
  .fields({ id: f.integer().readOnly().filterable().sortable(), task_id: f.relation('tasks').filterable(), noted_at: f.timestamp().readOnly().sortable(), body: f.text() })
  .primaryKey((r) => r.id)

const tasksView = view<typeof tasks>('tasks')
  .title((r) => r.title)
  .actions((a) => [a.update('close', { label: 'Close', set: { status: 'closed' } })])
  .layout((r) => [
    l.tab('Task', [l.section('Task', [r.title, r.status])]),
    l.tab('Log', [l.blocks(Thread({ title: 'Log of {{@root.title}}', resource: 'task_notes', filter: 'task_id = {{@root.id}}', time: 'noted_at', text: 'body', empty: 'Nothing logged yet.' }))]),
  ])

const models = { tasks: tasks.toModel(), task_notes: task_notes.toModel() }

// The server plans each block tree for its caller; the fake one serves the views as given, so the story plans them as the server would
const planned = (item: LayoutItemModel): LayoutItemModel => {
  if (item.kind === 'blocks') return { ...item, reads: compileReadPlan(item.tree as LayoutNode, { models, root: 'tasks' }).plan }
  return item.kind === 'tab' ? { ...item, items: item.items.map(planned) as typeof item.items } : item
}
const withPlans = (model: ViewModel): ViewModel => ({ ...model, layout: model.layout.map(planned) })

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()

const rows = () => ({
  tasks: [
    { id: 1, title: 'Ship the release', status: 'open' },
    { id: 2, title: 'Plan the offsite', status: 'open' },
  ],
  task_notes: [
    { id: 1, task_id: 1, noted_at: minutesAgo(30), body: 'Build started.' },
    { id: 2, task_id: 1, noted_at: minutesAgo(20), body: 'Build is green.' },
    { id: 3, task_id: 2, noted_at: minutesAgo(10), body: 'Venue booked.' },
  ],
})

const TaskPage = () => {
  const [api] = useState(() => fakeApi({ resources: Object.values(models), views: [withPlans(tasksView.toModel())], rows: rows() }))
  return (
    <div className="min-h-screen">
      <App client={api.client} auth={session} initialUrl="/tasks/1" />
    </div>
  )
}

export const RecordBlockTree: StoryObj = { name: "A task's log in a tab", render: () => <TaskPage /> }

/**
 * The Log tab draws the thread of the task's own notes, read by the key the address holds, each under its time with no
 * sender line; the record page keeps its title, its breadcrumb back to the list and its actions.
 */
export const Checks: StoryObj = {
  ...RecordBlockTree,
  name: "A task's log in a tab (checks)",
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByRole('link', { name: 'Log' }))
    const log = await canvas.findByRole('log')
    await within(log).findByText('Build is green.')
    expect(within(log).getByText('Build started.')).toBeTruthy()
    expect(within(log).queryByText('Venue booked.')).toBeNull()
    expect(await canvas.findByRole('heading', { name: 'Log of Ship the release' })).toBeTruthy()
    // One author's notes show no avatar or name, only when each was noted
    expect(log.querySelectorAll('[data-from="person"] time').length).toBeGreaterThan(0)
    expect(within(log).queryByText('?')).toBeNull()

    expect(canvas.getByRole('heading', { name: 'Ship the release', level: 1 })).toBeTruthy()
    expect(canvas.getByRole('button', { name: 'Close' })).toBeTruthy()
    expect(canvasElement.querySelector('a[href="/tasks"]')).not.toBeNull()
  },
}
