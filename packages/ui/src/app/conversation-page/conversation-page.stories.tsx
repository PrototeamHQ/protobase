import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { createStaticSession, type AuthSession, type LiveHandlers, type OrganizationPerson } from '@protobase/client'
import { f, resource, view, type ConversationPageModel } from '@protobase/schema'
import { App } from '../app'
import { fakeApi } from '../testing/fake-api'

const meta = { title: 'Record page/Conversation page', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

// A team chat: channels and direct messages whose pages are their conversations, configured with no component of the app's own

const channels = resource('channels')
  .table('channels')
  .fields({ id: f.integer().readOnly().filterable().sortable(), name: f.text().sortable(), topic: f.text().optional() })
  .primaryKey((r) => r.id)

const directMessages = resource('direct_messages')
  .table('direct_messages')
  .fields({ id: f.integer().readOnly().filterable().sortable(), member_ids: f.json() })
  .primaryKey((r) => r.id)

const messages = resource('messages')
  .table('messages')
  .fields({
    id: f.integer().readOnly().filterable().sortable(),
    channel_id: f.relation('channels').optional().filterable(),
    direct_message_id: f.relation('direct_messages').optional().filterable(),
    author_id: f.text().readOnly().filterable(),
    body: f.text(),
    mentions: f.json(),
    sent_at: f.timestamp().readOnly().sortable(),
    edited_at: f.timestamp().readOnly().optional(),
  })
  .primaryKey((r) => r.id)
  .author((r) => r.author_id)
  .live()

const readPositions = resource('read_positions')
  .table('read_positions')
  .fields({ id: f.integer().readOnly().filterable(), user_id: f.text().readOnly().filterable(), channel_id: f.relation('channels').optional().filterable(), last_read_id: f.integer() })
  .primaryKey((r) => r.id)
  .author((r) => r.user_id)

const message = { resource: 'messages', sender: 'author_id', time: 'sent_at', text: 'body', edited: 'edited_at', mentions: 'mentions' }
const readPosition = { resource: 'read_positions', field: 'channel_id', message: 'last_read_id' }

const channelsView = (position: ConversationPageModel['readPosition']) =>
  view<typeof channels>('channels')
    .names({ singular: 'Channel', plural: 'Channels' })
    .title((r) => r.name)
    .nav({ recent: { orderBy: 'name asc' } })
    .record({ conversation: { ...message, field: 'channel_id', subtitle: 'topic', placeholder: 'Message the channel', ...(position && { readPosition: position }) } })

const directMessagesView = view<typeof directMessages>('direct_messages')
  .names({ singular: 'Direct message', plural: 'Direct messages' })
  .nav({ recent: { orderBy: 'id asc' } })
  .record({ conversation: { ...message, field: 'direct_message_id', members: 'member_ids', empty: 'This is the start of your conversation.' } })

const hidden = (name: string) => view(name).nav({ hidden: true })

const people: OrganizationPerson[] = [
  { id: 'u-maya', name: 'Maya Jansen' },
  { id: 'u-sam', name: 'Sam Okafor' },
  { id: 'u-lin', name: 'Lin Park' },
]

const acme = { id: 'org-acme', name: 'Acme', slug: 'acme' }

// Maya, a member of Acme
const session = (): AuthSession => {
  const base = createStaticSession('story-token', { id: 'u-maya', email: 'maya@acme.example', name: 'Maya Jansen', role: 'user' })
  return {
    ...base,
    status: async () => ({ ...(await base.status()), organizations: { create: 'everyone', roles: [] } }),
    organizations: {
      ...base.organizations,
      current: async () => ({ organization: acme, role: 'member', appRoles: [], memberId: 'm-maya', globalRoles: [] }),
      list: async () => [acme],
      people: async () => people,
    },
  }
}

// Today at a time of day, so the messages fall on one day whenever the story runs
const today = (hours: number, minutes: number) => {
  const at = new Date()
  at.setHours(hours, minutes, 0, 0)
  return at.toISOString()
}

const rows = () => ({
  channels: [{ id: 1, name: 'general', topic: 'Company-wide news' }],
  direct_messages: [{ id: 1, member_ids: ['u-maya', 'u-sam'] }],
  messages: [
    { id: 1, channel_id: 1, author_id: 'u-sam', body: 'Morning all', mentions: [], sent_at: today(9, 0), edited_at: null },
    { id: 2, channel_id: 1, author_id: 'u-sam', body: 'The release is out', mentions: [], sent_at: today(9, 2), edited_at: null },
    { id: 3, channel_id: 1, author_id: 'u-maya', body: 'Nice work', mentions: [], sent_at: today(9, 10), edited_at: null },
    { id: 4, channel_id: 1, author_id: 'u-sam', body: 'Notes are in the wiki', mentions: [], sent_at: today(9, 30), edited_at: today(9, 31) },
    { id: 5, channel_id: 1, author_id: 'u-lin', body: '@Sam Okafor can you look at the build?', mentions: ['u-sam'], sent_at: today(9, 40), edited_at: null },
    { id: 6, direct_message_id: 1, author_id: 'u-sam', body: 'Lunch?', mentions: [], sent_at: today(11, 0), edited_at: null },
  ],
  // Maya read up to Nice work; Sam's own position is not hers to read
  read_positions: [
    { id: 1, user_id: 'u-maya', channel_id: 1, last_read_id: 3 },
    { id: 2, user_id: 'u-sam', channel_id: 1, last_read_id: 5 },
  ],
})

/** The rows the fake server holds and the page's live stream, so a play can change the conversation as others do. */
let stored: Record<string, Array<Record<string, unknown>>> = {}
const listeners = new Set<LiveHandlers>()
const tell = (operation: 'create' | 'update' | 'delete', key: string) => {
  for (const listener of listeners) listener.onChanges([{ resource: 'messages', key, operation }])
}

const Chat = ({ url, keepsPosition = true }: { url: string; keepsPosition?: boolean }) => {
  const position = keepsPosition ? readPosition : undefined
  const [client] = useState(() => {
    const created = fakeApi({
      resources: [channels.toModel(), directMessages.toModel(), messages.toModel(), readPositions.toModel()],
      views: [channelsView(position).toModel(channels.toModel()), directMessagesView.toModel(directMessages.toModel()), hidden('messages').toModel(), hidden('read_positions').toModel()],
      rows: rows(),
      bottomBar: { label: 'Chat', items: [{ kind: 'resource', resource: 'channels', label: 'Channels' }] },
      // Like the server, a create stamps its author and a message its time
      beforeWrite: (name, row) => {
        if (name === 'messages' && !row.sent_at) Object.assign(row, { author_id: 'u-maya', sent_at: new Date().toISOString(), edited_at: null })
        if (name === 'read_positions' && !row.user_id) row.user_id = 'u-maya'
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
    <div className="h-screen">
      <App client={client} auth={session()} initialUrl={url} workspace="Acme" />
    </div>
  )
}

const desktop = { name: 'Desktop 1280', styles: { width: '1280px', height: '800px' }, type: 'desktop' }
const phone = { name: 'Phone 390', styles: { width: '390px', height: '844px' }, type: 'mobile' }

/** A channel's page is its conversation: a header with its name, topic and Details, its messages and the box under them. */
export const ChannelConversation: StoryObj = { name: "A channel's conversation fills the page", render: () => <Chat url="/channels/1" /> }

/** A direct message's page, titled after the other person in it. */
export const DirectMessageConversation: StoryObj = { name: 'A direct message, titled after its other person', render: () => <Chat url="/direct_messages/1" /> }

// The conversation fills the area under the top bar down to `bottom`; the document does not scroll, and the box stays in view
const fillsTheArea = async (canvasElement: HTMLElement, bottom: () => number) => {
  const canvas = within(canvasElement)
  const log = await canvas.findByRole('log')
  await within(log).findByText('Notes are in the wiki')
  const header = canvasElement.querySelector('header')!.getBoundingClientRect()
  const box = canvas.getByRole('combobox', { name: 'Message' }).getBoundingClientRect()
  expect(document.scrollingElement!.scrollHeight).toBe(window.innerHeight)
  expect(log.getBoundingClientRect().top).toBeGreaterThanOrEqual(header.bottom)
  expect(box.bottom).toBeLessThanOrEqual(bottom() + 0.5)
  expect(box.top).toBeGreaterThan(header.bottom)
}

export const ChannelChecks: StoryObj = {
  ...ChannelConversation,
  name: "A channel's conversation fills the page (checks)",
  tags: ['play', '!dev'],
  parameters: { viewport: { options: { desktop } } },
  globals: { viewport: { value: 'desktop' } },
  play: async ({ canvasElement }) => {
    await fillsTheArea(canvasElement, () => window.innerHeight)
    const canvas = within(canvasElement)
    expect(canvas.getByRole('heading', { name: 'general' })).toBeVisible()
    expect(canvas.getByText('Company-wide news')).toBeVisible()
    expect(canvas.getByRole('link', { name: 'Details' })).toHaveAttribute('href', '/channels/1?standard=true')
    const log = within(canvas.getByRole('log'))
    // A day divider opens the day; Sam's quick run of two shows his name once, and his later message again
    expect(canvas.getByRole('log').firstElementChild).toHaveAttribute('data-chat-divider')
    expect(log.getAllByText('Sam Okafor')).toHaveLength(2)
    // The "New messages" line sits above the first message by someone else after Maya's position
    const line = log.getByRole('separator', { name: 'New messages' })
    expect(line.nextElementSibling).toHaveTextContent('Notes are in the wiki')
    expect(log.getByText('(edited)')).toBeVisible()
    expect(log.getByText('@Sam Okafor')).toHaveClass('text-primary')
    // Reading to the end moves Maya's position to the newest message, and Sam's stays his
    await waitFor(() => expect(stored.read_positions).toEqual([expect.objectContaining({ id: 1, last_read_id: 5 }), expect.objectContaining({ id: 2, last_read_id: 5 })]))
  },
}

export const OnAPhoneChecks: StoryObj = {
  ...ChannelConversation,
  name: "A channel's conversation fills the page at mobile width (checks)",
  tags: ['play', 'phone', '!dev'],
  parameters: { viewport: { options: { phone } } },
  globals: { viewport: { value: 'phone' } },
  play: async ({ canvasElement }) => {
    const bar = await within(canvasElement).findByRole('navigation', { name: 'Tabs' })
    await fillsTheArea(canvasElement, () => bar.getBoundingClientRect().top)
    // The top bar names the channel, so the header leaves its name out
    expect(within(canvasElement).queryByRole('heading', { name: 'general' })).toBeNull()
    expect(within(canvasElement).getByText('Company-wide news')).toBeVisible()
  },
}

export const DirectMessageChecks: StoryObj = {
  ...DirectMessageConversation,
  name: 'A direct message, titled after its other person (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(await canvas.findByRole('heading', { name: 'Sam Okafor' })).toBeVisible()
    const recent = await canvas.findByRole('list', { name: 'Recent direct messages' })
    expect(await within(recent).findByRole('link', { name: 'Sam Okafor' })).toHaveAttribute('href', '/direct_messages/1')
    await within(await canvas.findByRole('log')).findByText('Lunch?')
  },
}

export const MentionChecks: StoryObj = {
  ...ChannelConversation,
  name: '@ lists the members and the message keeps whom it mentions (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const box = await canvas.findByRole('combobox', { name: 'Message' })
    await userEvent.type(box, 'Thanks @li')
    const options = await canvas.findByRole('listbox', { name: 'People to mention' })
    // The writer is not offered
    expect(within(options).queryByRole('option', { name: 'Maya Jansen' })).toBeNull()
    await userEvent.click(within(options).getByRole('option', { name: 'Lin Park' }))
    await userEvent.type(box, 'for the fix{Enter}')
    await waitFor(() => expect(stored.messages!.at(-1)).toMatchObject({ channel_id: 1, body: 'Thanks @Lin Park for the fix', mentions: ['u-lin'] }))
    expect(await within(canvas.getByRole('log')).findByText('@Lin Park')).toHaveClass('text-primary')
  },
}

export const LiveChecks: StoryObj = {
  ...ChannelConversation,
  name: 'New, edited and deleted messages show as they happen (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const log = within(await within(canvasElement).findByRole('log'))
    await log.findByText('Morning all')
    stored.messages!.push({ id: 7, channel_id: 1, author_id: 'u-lin', body: 'Build is fixed', mentions: [], sent_at: today(9, 50), edited_at: null })
    tell('create', '7')
    await log.findByText('Build is fixed')
    Object.assign(stored.messages!.find((row) => row.id === 1)!, { body: 'Good morning all', edited_at: today(9, 51) })
    tell('update', '1')
    await log.findByText('Good morning all')
    expect(log.getAllByText('(edited)')).toHaveLength(2)
    stored.messages = stored.messages!.filter((row) => row.id !== 2)
    tell('delete', '2')
    await waitFor(() => expect(log.queryByText('The release is out')).toBeNull())
  },
}

export const WithoutReadPositionChecks: StoryObj = {
  render: () => <Chat url="/channels/1" keepsPosition={false} />,
  name: 'Without a read position, no New messages line and no writes (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const log = within(await within(canvasElement).findByRole('log'))
    await log.findByText('Notes are in the wiki')
    expect(log.queryByRole('separator', { name: 'New messages' })).toBeNull()
    expect(stored.read_positions).toEqual(rows().read_positions.map((row) => expect.objectContaining(row)))
  },
}
