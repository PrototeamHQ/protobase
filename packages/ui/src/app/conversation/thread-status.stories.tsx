import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, waitFor, within } from 'storybook/test'
import { createStaticSession, type LiveHandlers } from '@protobase/client'
import { f, l, resource, view } from '@protobase/schema'
import { App } from '../app'
import { fakeApi } from '../testing/fake-api'

const meta = { title: 'Record page/Conversation status', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'story', email: 'story@example.test', name: 'Story User', role: 'admin' })

// A chat with an assistant: each message says whether it arrived, and the chat says while the assistant writes a reply

const chats = resource('chats')
  .table('chats')
  .fields({ id: f.integer().readOnly().filterable().sortable(), title: f.text(), state: f.enum(['idle', 'working']) })
  .primaryKey((r) => r.id)
  .live()

const chat_messages = resource('chat_messages')
  .table('chat_messages')
  .fields({
    id: f.integer().readOnly().filterable().sortable(),
    chat_id: f.relation('chats').filterable(),
    sender: f.text(),
    sent_at: f.timestamp().readOnly().sortable(),
    body: f.text(),
    delivery: f.enum(['sent', 'delivered']).optional(),
  })
  .primaryKey((r) => r.id)
  .live()

const messagesView = view<typeof chat_messages>('chat_messages').fields((r) => ({ delivery: r.delivery.valueLabels({ sent: 'Sent', delivered: 'Delivered' }) }))
const chatsView = view<typeof chats>('chats')
  .title((r) => r.title)
  .layout((r) => [
    l.section('Chat', [r.title]),
    l.thread('Conversation', { resource: 'chat_messages', field: 'chat_id', sender: 'sender', time: 'sent_at', text: 'body', status: 'delivery', working: "state = 'working'" }),
    l.composer({ resource: 'chat_messages', field: 'chat_id', text: 'body' }),
  ])

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()

const rows = () => ({
  chats: [{ id: 1, title: 'Release planning', state: 'working' }],
  chat_messages: [
    { id: 1, chat_id: 1, sender: 'Assistant', sent_at: minutesAgo(12), body: 'The release branch is cut.', delivery: null },
    { id: 2, chat_id: 1, sender: 'Story User', sent_at: minutesAgo(2), body: 'Write the changelog, please.', delivery: 'delivered' },
  ],
})

/** The rows the fake server holds and the page's live stream, so a play can change the chat as the assistant does. */
let stored: Record<string, Array<Record<string, unknown>>> = {}
const listeners = new Set<LiveHandlers>()

const ChatPage = () => {
  const [client] = useState(() => {
    const created = fakeApi({
      resources: [chats.toModel(), chat_messages.toModel()],
      views: [messagesView.toModel(), chatsView.toModel()],
      rows: rows(),
      // Like the server, a create stamps its sender and time and marks the message sent
      beforeWrite: (name, row) => {
        if (name === 'chat_messages' && !row.sent_at) Object.assign(row, { sender: 'Story User', sent_at: new Date().toISOString(), delivery: 'sent' })
      },
    })
    stored = created.rows
    return {
      ...created.client,
      live: (handlers: LiveHandlers) => {
        listeners.add(handlers)
        return () => void listeners.delete(handlers)
      },
    }
  })
  return (
    <div className="min-h-screen">
      <App client={client} auth={session} initialUrl="/chats/1" />
    </div>
  )
}

export const ThreadStatus: StoryObj = { name: 'A chat with delivery and a working assistant', render: () => <ChatPage /> }

/** A message with a status shows its label under it and one without shows none; the working indicator goes once the chat stops working. */
export const Checks: StoryObj = {
  ...ThreadStatus,
  name: 'A chat with delivery and a working assistant (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const log = await canvas.findByRole('log')
    await within(log).findByText('Write the changelog, please.')
    expect(within(log).getByText('Delivered')).toBeVisible()
    expect(within(log).queryByText('Sent')).toBeNull()
    expect(log.querySelectorAll('[data-from="person"] p.text-xs')).toHaveLength(1)

    await waitFor(() => expect(canvasElement.querySelector('[data-chat-working]')).toHaveTextContent('Writing a reply…'))

    stored.chats![0]!.state = 'idle'
    for (const listener of listeners) listener.onChanges([{ resource: 'chats', key: '1', operation: 'update' }])
    await waitFor(() => expect(canvasElement.querySelector('[data-chat-working]')).toBeNull())
  },
}
