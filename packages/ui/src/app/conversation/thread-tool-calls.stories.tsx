import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, within } from 'storybook/test'
import { createStaticSession } from '@protobase/client'
import { f, l, resource, view } from '@protobase/schema'
import { App } from '../app'
import { fakeApi } from '../testing/fake-api'

const meta = { title: 'Record page/Conversation tool calls', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'story', email: 'story@example.test', name: 'Story User', role: 'admin' })

// A chat with an assistant whose tool calls show between its messages, each with its status and what it took and gave

const chats = resource('chats')
  .table('chats')
  .fields({ id: f.integer().readOnly().filterable().sortable(), title: f.text() })
  .primaryKey((r) => r.id)

const chat_messages = resource('chat_messages')
  .table('chat_messages')
  .fields({ id: f.integer().readOnly().filterable().sortable(), chat_id: f.relation('chats').filterable(), sender: f.text(), sent_at: f.timestamp().readOnly().sortable(), body: f.text() })
  .primaryKey((r) => r.id)

const tool_calls = resource('tool_calls')
  .table('tool_calls')
  .fields({
    id: f.integer().readOnly().filterable().sortable(),
    chat_id: f.relation('chats').filterable(),
    tool: f.text(),
    called_at: f.timestamp().sortable(),
    state: f.enum(['running', 'done', 'error']),
    input: f.json().optional(),
    output: f.json().optional(),
    failure: f.text().optional(),
  })
  .primaryKey((r) => r.id)

const callsView = view<typeof tool_calls>('tool_calls').fields((r) => ({ state: r.state.valueLabels({ running: 'Running', done: 'Done', error: 'Failed' }) }))
const chatsView = view<typeof chats>('chats')
  .title((r) => r.title)
  .layout((r) => [
    l.section('Chat', [r.title]),
    l.thread('Conversation', {
      resource: 'chat_messages',
      field: 'chat_id',
      sender: 'sender',
      time: 'sent_at',
      text: 'body',
      calls: { resource: 'tool_calls', field: 'chat_id', name: 'tool', time: 'called_at', status: 'state', input: 'input', result: 'output', error: 'failure' },
    }),
  ])

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()

const rows = () => ({
  chats: [{ id: 1, title: 'Release planning' }],
  chat_messages: [
    { id: 1, chat_id: 1, sender: 'Story User', sent_at: minutesAgo(20), body: 'Close the tasks that are done.' },
    { id: 2, chat_id: 1, sender: 'Assistant', sent_at: minutesAgo(10), body: 'Task 7 is locked, so I left it open.' },
    { id: 3, chat_id: 1, sender: 'Story User', sent_at: minutesAgo(5), body: 'Then check the build.' },
  ],
  tool_calls: [
    { id: 1, chat_id: 1, tool: 'list_tasks', called_at: minutesAgo(18), state: 'done', input: { state: 'done' }, output: [{ id: 7, title: 'Write the changelog' }], failure: null },
    { id: 2, chat_id: 1, tool: 'close_task', called_at: minutesAgo(15), state: 'error', input: { id: 7 }, output: null, failure: 'Task 7 is locked by a review.' },
    { id: 3, chat_id: 1, tool: 'check_build', called_at: minutesAgo(4), state: 'running', input: { branch: 'main' }, output: null, failure: null },
  ],
})

const ChatPage = () => {
  const [client] = useState(() => fakeApi({ resources: [chats.toModel(), chat_messages.toModel(), tool_calls.toModel()], views: [callsView.toModel(), chatsView.toModel()], rows: rows() }).client)
  return (
    <div className="min-h-screen">
      <App client={client} auth={session} initialUrl="/chats/1" />
    </div>
  )
}

export const ToolCalls: StoryObj = { name: 'A chat with tool calls between its messages', render: () => <ChatPage /> }

/** The calls show in time order between the messages, each with its status, closed until opened to its input, result and error. */
export const Checks: StoryObj = {
  ...ToolCalls,
  name: 'A chat with tool calls between its messages (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const log = await canvas.findByRole('log')
    await within(log).findByText('check_build')
    const order = [...log.querySelectorAll('[data-from="person"] .whitespace-pre-wrap, [data-tool-call] .font-mono')].map((element) => element.textContent)
    expect(order).toEqual(['Close the tasks that are done.', 'list_tasks', 'close_task', 'Task 7 is locked, so I left it open.', 'Then check the build.', 'check_build'])

    const failed = within(log).getByRole('button', { name: /close_task/ })
    expect(failed).toHaveAttribute('aria-expanded', 'false')
    expect(within(failed).getByText('Failed').closest('.text-danger-text')).not.toBeNull()
    expect(within(log).queryByText('Task 7 is locked by a review.')).toBeNull()
    await userEvent.click(failed)
    expect(failed).toHaveAttribute('aria-expanded', 'true')
    expect(within(log).getByText('Task 7 is locked by a review.')).toBeVisible()
    expect(within(log).getByText(/"id": 7/)).toBeVisible()

    await userEvent.click(within(log).getByRole('button', { name: /list_tasks/ }))
    expect(within(log).getByText(/"title": "Write the changelog"/)).toBeVisible()
    expect(within(log).getByText('Running')).toBeVisible()
  },
}
