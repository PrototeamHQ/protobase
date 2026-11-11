import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { createStaticSession } from '@protobase/client'
import { f, l, resource, view } from '@protobase/schema'
import { App } from '../app'
import { fakeApi } from '../testing/fake-api'

const meta = { title: 'Record page/Conversation', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'story', email: 'story@example.test', name: 'Story User', role: 'admin' })

// A task's chat: each message points at its task, declared in the task's layout with no component of the app's own

const people = resource('people')
  .table('people')
  .fields({ id: f.text().filterable().sortable(), name: f.text() })
  .primaryKey((r) => r.id)

const tasks = resource('tasks')
  .table('tasks')
  .fields({ id: f.integer().readOnly().filterable().sortable(), title: f.text() })
  .primaryKey((r) => r.id)

const task_messages = resource('task_messages')
  .table('task_messages')
  .fields({
    id: f.integer().readOnly().filterable().sortable(),
    task_id: f.relation('tasks').filterable(),
    author_id: f.relation('people').filterable(),
    sent_at: f.timestamp().readOnly().sortable(),
    body: f.text(),
  })
  .primaryKey((r) => r.id)
  .author((r) => r.author_id)

const peopleView = view<typeof people>('people').title((r) => r.name)
const messagesView = view<typeof task_messages>('task_messages').fields((r) => ({ body: r.body.markdown() }))
const tasksView = view<typeof tasks>('tasks')
  .title((r) => r.title)
  .layout((r) => [
    l.section('Task', [r.title]),
    l.thread('Conversation', { resource: 'task_messages', field: 'task_id', sender: 'author_id', time: 'sent_at', text: 'body', empty: 'Nothing said about this task yet.' }),
    l.composer({ resource: 'task_messages', field: 'task_id', text: 'body', placeholder: 'Message about this task' }),
  ])

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()

const rows = () => ({
  people: [
    { id: 'story', name: 'Story User' },
    { id: 'ann', name: 'Ann de Vries' },
  ],
  tasks: [
    { id: 1, title: 'Ship the release' },
    { id: 2, title: 'Plan the offsite' },
  ],
  task_messages: [
    { id: 1, task_id: 1, author_id: 'ann', sent_at: minutesAgo(30), body: 'The build is **green**.' },
    { id: 2, task_id: 1, author_id: 'ann', sent_at: minutesAgo(20), body: 'Left to do:\n\n- the changelog\n- the tag' },
    { id: 3, task_id: 2, author_id: 'ann', sent_at: minutesAgo(10), body: 'Book the venue.' },
  ],
})

/** The rows the fake server holds, so a play can check what a send stored. */
let stored: Record<string, Array<Record<string, unknown>>> = {}

const TaskPage = () => {
  const [api] = useState(() => {
    const created = fakeApi({
      resources: [people.toModel(), tasks.toModel(), task_messages.toModel()],
      views: [peopleView.toModel(), messagesView.toModel(), tasksView.toModel()],
      rows: rows(),
      // Like the server, a create stamps its author and time
      beforeWrite: (name, row) => {
        if (name === 'task_messages' && !row.author_id) Object.assign(row, { author_id: 'story', sent_at: new Date().toISOString() })
      },
    })
    stored = created.rows
    return created
  })
  return (
    <div className="min-h-screen">
      <App client={api.client} auth={session} initialUrl="/tasks/1" />
    </div>
  )
}

export const RecordConversation: StoryObj = { name: "A task's conversation", render: () => <TaskPage /> }

/**
 * The thread shows only the messages that point at the task, their markdown rendered; a send creates a message that
 * points at the task, which the thread then shows.
 */
export const Checks: StoryObj = {
  ...RecordConversation,
  name: "A task's conversation (checks)",
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const log = await canvas.findByRole('log')
    await within(log).findByText('green')
    expect(within(log).queryByText('Book the venue.')).toBeNull()

    // Markdown renders: bold as strong, a list as list items
    await waitFor(() => expect(within(log).getByText('green').tagName).toBe('STRONG'))
    expect(within(log).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['the changelog', 'the tag'])

    await userEvent.type(canvas.getByRole('textbox', { name: 'Message' }), 'Tagged *now*{Enter}')
    await within(log).findByText('now')
    expect(stored.task_messages!.find((row) => row.body === 'Tagged *now*')).toMatchObject({ task_id: 1, author_id: 'story' })
  },
}
