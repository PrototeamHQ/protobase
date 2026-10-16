import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { createStaticSession } from '@protobase/client'
import { f, l, resource, view } from '@protobase/schema'
import { App } from './app'
import { fakeApi } from './testing/fake-api'

const meta = { title: 'Record page/Relation key', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'story', email: 'story@example.test', name: 'Story User', role: 'admin' })

// A report belongs to one task and is keyed by it, so its primary key is a relation the list shows by the task's title.
const tasks = resource('tasks')
  .table('tasks')
  .fields({ id: f.text().filterable().sortable(), title: f.text() })
  .primaryKey((r) => r.id)

const reports = resource('reports')
  .table('reports')
  .fields({ task_id: f.relation('tasks').filterable().sortable(), summary: f.text() })
  .primaryKey((r) => r.task_id)

const tasksView = view<typeof tasks>('tasks')
  .title((r) => r.title)
  .names({ singular: 'Task', plural: 'Tasks' })
  .layout((r) => [l.section('Task', [r.id, r.title]), l.related('Report', { resource: 'reports', field: 'task_id', columns: ['task_id', 'summary'] })])

const reportsView = view<typeof reports>('reports')
  .title((r) => r.summary)
  .names({ singular: 'Report', plural: 'Reports' })
  .list((r) => ({ columns: [r.task_id, r.summary] }))
  .layout((r) => [l.section('Report', [r.task_id, r.summary])])

const rows = {
  tasks: [
    { id: 'task-7', title: 'Fix login' },
    { id: 'task-8', title: 'Ship export' },
  ],
  reports: [{ task_id: 'task-7', summary: 'Login works again' }],
}

/** The rows the fake server holds, so a play can check what a save stored. */
let stored: Record<string, Array<Record<string, unknown>>> = {}

const Reports = ({ path }: { path: string }) => {
  const [api] = useState(() => {
    const created = fakeApi({ resources: [tasks.toModel(), reports.toModel()], views: [tasksView.toModel(), reportsView.toModel()], rows: structuredClone(rows) })
    stored = created.rows
    return created
  })
  return (
    <div className="h-screen">
      <App client={api.client} auth={session} initialUrl={path} />
    </div>
  )
}

// The record page is open when its breadcrumb ends in a link to it.
const opened = async (canvasElement: HTMLElement, href: string) => {
  const trail = within(await within(canvasElement).findByRole('navigation', { name: 'Breadcrumb' }))
  await waitFor(() => expect(trail.getByRole('link', { current: 'page' })).toHaveAttribute('href', href))
}

/** A list row opens the record by the related task's id, not by the title the list shows for it. */
export const ListRowOpensRecord: StoryObj = {
  tags: ['play'],
  render: () => <Reports path="/reports" />,
  play: async ({ canvasElement }) => {
    await userEvent.click(await within(canvasElement).findByText('Login works again'))
    await opened(canvasElement, '/reports/task-7')
  },
}

/** A row of a related list opens the record by its key too. */
export const RelatedRowOpensRecord: StoryObj = {
  tags: ['play'],
  render: () => <Reports path="/tasks/task-7" />,
  play: async ({ canvasElement }) => {
    await userEvent.click(await within(canvasElement).findByText('Login works again'))
    await opened(canvasElement, '/reports/task-7')
  },
}

/** The record page reads and saves the record by its relation key. */
export const EditAndSave: StoryObj = {
  tags: ['play'],
  render: () => <Reports path="/reports/task-7" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const summary = await canvas.findByDisplayValue('Login works again')
    await userEvent.clear(summary)
    await userEvent.type(summary, 'Login fixed for good')
    await userEvent.click(canvas.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(stored.reports![0]!.summary).toBe('Login fixed for good'))
    await opened(canvasElement, '/reports/task-7')
  },
}
