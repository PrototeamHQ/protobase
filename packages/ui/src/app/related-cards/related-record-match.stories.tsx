import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, waitFor, within } from 'storybook/test'
import { createStaticSession, type Client, type ListParams, type LiveHandlers } from '@protobase/client'
import { f, l, resource, view } from '@protobase/schema'
import { App } from '../app'
import { fakeApi } from '../testing/fake-api'

const meta = { title: 'Record page/A related record in full, when what it matches changes', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'story', email: 'story@example.test', name: 'Story User', role: 'admin' })

// A task shows the notes of the objective it serves, which another user moves it from

const objectives = resource('objectives')
  .table('objectives')
  .fields({ id: f.integer().readOnly().filterable().sortable(), title: f.text() })
  .primaryKey((r) => r.id)

const notes = resource('objective_notes')
  .table('objective_notes')
  .fields({ id: f.integer().readOnly().filterable().sortable(), objective_id: f.relation('objectives').filterable(), notes: f.text().optional() })
  .primaryKey((r) => r.id)

const tasks = resource('tasks')
  .table('tasks')
  .fields({ id: f.integer().readOnly().filterable().sortable(), title: f.text(), objective_id: f.relation('objectives') })
  .primaryKey((r) => r.id)
  .live()

const tasksView = view<typeof tasks>('tasks')
  .title((r) => r.title)
  .layout((r) => [l.section('Task', [r.title, r.objective_id]), l.related('Objective notes', { resource: 'objective_notes', field: 'objective_id', from: 'objective_id', presentation: 'record', columns: ['notes'] })])

const notesView = view<typeof notes>('objective_notes').names({ singular: 'Note', plural: 'Notes' })

/** The rows the fake server holds, the page's live stream, and the release of the second objective's notes. */
let stored: Record<string, Array<Record<string, unknown>>> = {}
const listeners = new Set<LiveHandlers>()
let release = () => {}

const Task = () => {
  const [client] = useState(() => {
    const created = fakeApi({
      resources: [objectives.toModel(), notes.toModel(), tasks.toModel()],
      views: [tasksView.toModel(), notesView.toModel()],
      rows: {
        objectives: [{ id: 1, title: 'Fantastic default UX' }, { id: 2, title: 'Faster lists' }],
        objective_notes: [{ id: 1, objective_id: 1, notes: 'Notes on the default UX.' }, { id: 2, objective_id: 2, notes: 'Notes on faster lists.' }],
        tasks: [{ id: 1, title: 'Tidy the record page', objective_id: 1 }],
      },
    })
    stored = created.rows
    const released = new Promise<void>((resolve) => (release = resolve))
    return {
      ...created.client,
      // The second objective's notes wait until the play releases them
      list: async (name: string, params?: ListParams) => {
        if (name === 'objective_notes' && params?.filter === 'objective_id = 2') await released
        return created.client.list(name, params)
      },
      live: (handlers: LiveHandlers) => {
        listeners.add(handlers)
        return () => void listeners.delete(handlers)
      },
    } as Client
  })
  return (
    <div className="min-h-screen">
      <App client={client} auth={session} initialUrl="/tasks/1" />
    </div>
  )
}

/** Moved to another objective, the task drops the first objective's notes and their link while the other's load. */
export const Moved: StoryObj = {
  name: 'A task moved to another objective (checks)',
  tags: ['play', '!dev'],
  render: () => <Task />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const section = within((await canvas.findByRole('heading', { name: 'Objective notes' })).closest('section')!)
    expect(await section.findByText('Notes on the default UX.')).toBeVisible()
    expect(section.getByRole('link', { name: 'Open note' }).getAttribute('href')).toBe('/objective_notes/1')

    stored.tasks![0]!.objective_id = 2
    for (const listener of listeners) listener.onChanges([{ resource: 'tasks', key: '1', operation: 'update' }])
    await waitFor(() => expect(canvasElement.querySelector('main a[href="/objectives/2"]')).not.toBeNull())
    const moved = within(canvas.getByRole('heading', { name: 'Objective notes' }).closest('section')!)
    expect(moved.queryByText('Notes on the default UX.')).toBeNull()
    expect(moved.queryByRole('link', { name: 'Open note' })).toBeNull()

    release()
    expect(await moved.findByText('Notes on faster lists.')).toBeVisible()
    expect(moved.getByRole('link', { name: 'Open note' }).getAttribute('href')).toBe('/objective_notes/2')
  },
}
