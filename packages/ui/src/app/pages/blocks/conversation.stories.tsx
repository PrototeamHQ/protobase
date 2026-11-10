import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { createStaticSession } from '@protobase/client'
import { Card, Composer, Page, Thread, page } from '@protobase/layout'
import { f, resource, view } from '@protobase/schema'
import { App } from '../../app'
import { fakeApi } from '../../testing/fake-api'

const viewports = { mobile360: { name: 'Mobile 360', styles: { width: '360px', height: '740px' }, type: 'mobile' } } as const

const meta = { title: 'Composed pages/Conversation', parameters: { layout: 'fullscreen', viewport: { options: viewports } } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'story', email: 'story@example.test', name: 'Story User', role: 'admin' })

// A team's chat: messages in rooms, each sent by a person, declared in the layout with no component of the app's own

const people = resource('people')
  .table('people')
  .fields({ id: f.text().filterable().sortable(), name: f.text() })
  .primaryKey((r) => r.id)

const messages = resource('messages')
  .table('messages')
  .fields({
    id: f.integer().readOnly().filterable().sortable(),
    author_id: f.relation('people').filterable(),
    sent_at: f.timestamp().readOnly().sortable(),
    room: f.text().filterable(),
    body: f.text(),
  })
  .primaryKey((r) => r.id)
  .author((r) => r.author_id)

const peopleView = view<typeof people>('people').title((r) => r.name)

const chat = page(
  'chat',
  Page({
    title: 'Team chat',
    children: [
      Card({
        title: 'General',
        children: [
          Thread({ resource: 'messages', filter: "room = 'general'", sender: 'author_id', time: 'sent_at', text: 'body', limit: 6, empty: 'No one has said anything yet.' }),
          Composer({ resource: 'messages', field: 'body', values: { room: 'general' }, placeholder: 'Message General' }),
        ],
      }),
    ],
  }),
)

/** A time on the browser's own day `daysAgo` days back, so the thread's day lines match whatever the UTC date is. */
const at = (daysAgo: number, time: string) => {
  const [hours, minutes] = time.split(':').map(Number)
  const day = new Date()
  day.setDate(day.getDate() - daysAgo)
  day.setHours(hours!, minutes, 0, 0)
  return day.toISOString()
}

const rows = () => ({
  people: [
    { id: 'story', name: 'Story User' },
    { id: 'ann', name: 'Ann de Vries' },
    { id: 'bo', name: 'Bo Jansen' },
  ],
  messages: [
    { id: 1, author_id: 'ann', sent_at: at(2, '08:00'), room: 'general', body: 'Good morning all.' },
    { id: 2, author_id: 'bo', sent_at: at(1, '09:12'), room: 'general', body: 'The printer on the second floor is out of toner.' },
    { id: 3, author_id: 'bo', sent_at: at(1, '09:13'), room: 'general', body: 'Who orders it?' },
    { id: 4, author_id: 'ann', sent_at: at(1, '10:40'), room: 'general', body: 'I did, it comes tomorrow.' },
    { id: 5, author_id: 'ann', sent_at: at(0, '07:30'), room: 'general', body: 'The toner is here.' },
    { id: 6, author_id: 'bo', sent_at: at(0, '07:45'), room: 'general', body: 'Thanks Ann!\nPutting it in now.' },
    { id: 7, author_id: 'ann', sent_at: at(0, '08:05'), room: 'general', body: 'Lunch at noon?' },
    { id: 8, author_id: 'bo', sent_at: at(0, '08:10'), room: 'sales', body: 'Not in this room.' },
  ],
})

/** The rows the fake server holds, so a play can check what a send stored. */
let stored: Record<string, Array<Record<string, unknown>>> = {}

const Chat = () => {
  const [api] = useState(() => {
    const created = fakeApi({
      resources: [people.toModel(), messages.toModel()],
      views: [peopleView.toModel()],
      pages: [chat.toModel()],
      rows: rows(),
      // Like the server, a create stamps its author and time; Ann answers each message straight away
      beforeWrite: (name, row) => {
        if (name !== 'messages' || row.author_id) return
        if (row.body === 'Too late') throw new Error('The room is closed')
        Object.assign(row, { author_id: 'story', sent_at: new Date().toISOString() })
      },
      afterWrite: (name, row, all) => {
        if (name !== 'messages' || row.author_id !== 'story') return
        all.messages!.push({ id: all.messages!.length + 100, author_id: 'ann', sent_at: new Date(Date.now() + 1000).toISOString(), room: 'general', body: 'Sounds good.' })
      },
    })
    stored = created.rows
    return created
  })
  return (
    <div className="min-h-screen">
      <App client={api.client} auth={session} initialUrl="/chat" />
    </div>
  )
}

export const Conversation: StoryObj = { name: 'A team chat', render: () => <Chat /> }

export const Phone: StoryObj = { ...Conversation, name: 'A team chat, on a phone', globals: { viewport: { value: 'mobile360' } } }

/**
 * The thread shows the room's latest messages oldest first, each under its sender's name and time with a line between
 * days, earlier ones on request; a send creates a message as the signed-in user, and what arrives lands in the
 * thread's polite live region, which screen readers announce.
 */
export const Checks: StoryObj = {
  ...Conversation,
  name: 'A team chat (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const log = await canvas.findByRole('log')
    expect(log).toHaveAttribute('aria-live', 'polite')
    await within(log).findByText('Lunch at noon?')
    const said = () => [...log.querySelectorAll('[data-from="person"]')].map((message) => message.textContent)
    expect(said()[0]).toContain('Bo Jansen')
    expect(said()[0]).toContain('The printer on the second floor is out of toner.')
    expect(said()[1]).toBe('Who orders it?')
    expect(said().at(-1)).toContain('Lunch at noon?')
    expect(within(log).getAllByRole('separator').map((line) => line.getAttribute('aria-label'))).toEqual(['Yesterday', 'Today'])
    expect(within(log).queryByText('Not in this room.')).toBeNull()

    // Sent while scrolled back to the top, the reader's own message takes them to the end
    const scroller = log.parentElement!
    scroller.scrollTop = 0
    scroller.dispatchEvent(new Event('scroll'))
    await userEvent.click(canvas.getByRole('button', { name: 'Load earlier messages' }))
    await within(log).findByText('Good morning all.')
    expect(canvas.queryByRole('button', { name: 'Load earlier messages' })).toBeNull()

    await userEvent.type(canvas.getByRole('textbox', { name: 'Message' }), 'See you there{Enter}')
    await within(log).findByText('See you there')
    await within(log).findByText('Sounds good.')
    await waitFor(() => expect(scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop).toBeLessThan(2))
    expect(stored.messages!.find((row) => row.body === 'See you there')).toMatchObject({ author_id: 'story', room: 'general' })
    const box = canvas.getByRole('textbox', { name: 'Message' })
    await waitFor(() => expect(box).toHaveValue(''))

    // A refused message stays in the box to send again
    await userEvent.type(box, 'Too late{Enter}')
    expect(await canvas.findByRole('alert')).toHaveTextContent('Not sent')
    expect(box).toHaveValue('Too late')
  },
}
