import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { createStaticSession, type AuthSession, type Client, type OrganizationPerson, type RecordCall } from '@protobase/client'
import { f, resource, view } from '@protobase/schema'
import { App } from '../app'
import { fakeApi } from '../testing/fake-api'

const meta = { title: 'Record page/Conversation page/Call', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

// A channel whose conversation has a call, configured with no component of the app's own: `call` names the function
// that admits people to it

const channels = resource('channels')
  .table('channels')
  .fields({ id: f.integer().readOnly().filterable().sortable(), name: f.text().sortable() })
  .primaryKey((r) => r.id)

const messages = resource('messages')
  .table('messages')
  .fields({
    id: f.integer().readOnly().filterable().sortable(),
    channel_id: f.relation('channels').filterable(),
    thread_id: f.relation('messages').optional().filterable(),
    author_id: f.text().readOnly().filterable(),
    body: f.text(),
    mentions: f.json(),
    sent_at: f.timestamp().readOnly().sortable(),
    reply_count: f.integer().readOnly(),
    last_reply_at: f.timestamp().readOnly().optional(),
  })
  .primaryKey((r) => r.id)
  .author((r) => r.author_id)

const channelsView = (call: string | undefined) =>
  view<typeof channels>('channels')
    .names({ singular: 'Channel', plural: 'Channels' })
    .title((r) => r.name)
    .nav({ recent: { orderBy: 'name asc' } })
    .record({
      conversation: {
        resource: 'messages',
        field: 'channel_id',
        sender: 'author_id',
        time: 'sent_at',
        text: 'body',
        mentions: 'mentions',
        thread: { field: 'thread_id', count: 'reply_count', last: 'last_reply_at' },
        ...(call && { call }),
      },
    })

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

const message = (id: number, author: string, body: string, minutes: number, extra: Record<string, unknown> = {}) => ({ id, channel_id: 1, thread_id: null, author_id: author, body, mentions: [], sent_at: today(9, minutes), reply_count: 0, last_reply_at: null, ...extra })

const rows = () => ({
  channels: [{ id: 1, name: 'general' }],
  messages: [message(1, 'u-sam', 'Morning all', 0, { reply_count: 1, last_reply_at: today(9, 20) }), message(2, 'u-lin', 'Morning Sam', 20, { thread_id: 1 }), message(3, 'u-maya', 'Standup in five', 30)],
})

const ongoing: RecordCall = {
  id: 'call-1',
  started_by: 'u-sam',
  started_at: today(9, 40),
  ended_at: null,
  members: ['u-sam', 'u-lin', 'u-jo'].map((member) => ({ member, joined_at: today(9, 40) })),
  removed: [],
}

/** The rows the fake server holds, so a play can check what the page wrote. */
let stored: Record<string, Array<Record<string, unknown>>> = {}

// A record channel that tells nothing: the calls the page reads first are all it gets
const quietChannel = (() => ({ on: () => () => undefined, onStatus: () => () => undefined, leave: () => undefined })) as unknown as Client['channel']

const Chat = ({ url, withCall = true, calls = [] }: { url: string; withCall?: boolean; calls?: RecordCall[] }) => {
  const [client] = useState(() => {
    const created = fakeApi({
      resources: [channels.toModel(), messages.toModel()],
      views: [channelsView(withCall ? 'call' : undefined).toModel(channels.toModel()), hidden('messages').toModel()],
      rows: rows(),
      bottomBar: { label: 'Chat', items: [{ kind: 'resource', resource: 'channels', label: 'Channels' }] },
      // Like the server, a create stamps its author and a message its time
      beforeWrite: (name, row) => {
        if (name === 'messages' && !row.sent_at) Object.assign(row, { author_id: 'u-maya', sent_at: new Date().toISOString(), reply_count: 0, last_reply_at: null, thread_id: row.thread_id ?? null })
      },
    })
    stored = created.rows
    return {
      ...created.client,
      live: () => () => undefined,
      channel: quietChannel,
      calls: async () => calls,
      functionSocketUrl: (name: string, query?: Record<string, string>) => `ws://app.example/api/functions/${name}?${new URLSearchParams(query)}`,
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
const atDesktop = { parameters: { viewport: { options: { desktop } } }, globals: { viewport: { value: 'desktop' } } }
const atPhone = { parameters: { viewport: { options: { phone } } }, globals: { viewport: { value: 'phone' } } }

/** Start call in the header, while no call goes on. */
export const StartCall: StoryObj = { name: 'Start call in the header', render: () => <Chat url="/channels/1" /> }

/** The call going on, with how many are in it and Join. */
export const CallInProgress: StoryObj = { name: 'A call in progress, with Join', render: () => <Chat url="/channels/1" calls={[ongoing]} /> }

/** The page joining the call: the call beside the messages. */
export const Joining: StoryObj = { name: 'The call beside the messages', render: () => <Chat url="/channels/1?call=join" /> }

/** The call and a thread both open: the call, the messages, then the thread. */
export const JoiningWithThread: StoryObj = { name: 'The call with a thread open', render: () => <Chat url="/channels/1?call=join&thread=1" /> }

const preview = (canvasElement: HTMLElement) => within(canvasElement).findByRole('region', { name: 'Your camera before you join' })

// The box under the messages is in view, above `bottom`, and what it sends lands in the conversation
const writesDuringTheCall = async (canvasElement: HTMLElement, bottom: number) => {
  const box = await within(canvasElement).findByRole('combobox', { name: 'Message' })
  expect(box.getBoundingClientRect().bottom).toBeLessThanOrEqual(bottom + 0.5)
  await userEvent.type(box, 'Joining now{Enter}')
  await waitFor(() => expect(stored.messages!.at(-1)).toMatchObject({ channel_id: 1, thread_id: null, body: 'Joining now' }))
  expect(await within(within(canvasElement).getByRole('log')).findByText('Joining now')).toBeVisible()
}

export const StartCallChecks: StoryObj = {
  ...StartCall,
  ...atDesktop,
  name: 'Start call is a link to the page that joins the call (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const start = await canvas.findByRole('link', { name: 'Start call' })
    expect(start).toHaveAttribute('href', '/channels/1?call=join')
    expect(canvas.queryByRole('region', { name: 'Your camera before you join' })).toBeNull()
    await userEvent.click(start)
    expect(await preview(canvasElement)).toBeVisible()
  },
}

export const CallInProgressChecks: StoryObj = {
  ...CallInProgress,
  ...atDesktop,
  name: 'A call in progress shows how many are in it, with Join (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const mark = within((await canvas.findByText('Call in progress')).closest<HTMLElement>('[role="status"]')!)
    expect(mark.getByText('Call in progress')).toBeVisible()
    expect(mark.getByLabelText('3 people')).toHaveTextContent('3')
    expect(mark.getByRole('link', { name: 'Join' })).toHaveAttribute('href', '/channels/1?call=join')
    expect(canvas.queryByRole('link', { name: 'Start call' })).toBeNull()
  },
}

export const WithoutCallChecks: StoryObj = {
  ...atDesktop,
  name: 'Without call, the header has no call and the address joins none (checks)',
  tags: ['play', '!dev'],
  render: () => <Chat url="/channels/1?call=join" withCall={false} calls={[ongoing]} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await within(await canvas.findByRole('log')).findByText('Standup in five')
    expect(canvas.getByRole('link', { name: 'Details' })).toBeVisible()
    expect(canvas.queryByRole('link', { name: 'Start call' })).toBeNull()
    expect(canvas.queryByText('Call in progress')).toBeNull()
    expect(canvas.queryByRole('region', { name: 'Your camera before you join' })).toBeNull()
  },
}

export const JoiningChecks: StoryObj = {
  ...Joining,
  ...atDesktop,
  name: 'The call shows beside the messages, which still take new ones (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const call = (await preview(canvasElement)).getBoundingClientRect()
    const log = (await canvas.findByRole('log')).getBoundingClientRect()
    expect(call.right).toBeLessThanOrEqual(log.left + 0.5)
    // On the page that joins, the header offers no second Start call
    expect(canvas.queryByRole('link', { name: 'Start call' })).toBeNull()
    expect(document.scrollingElement!.scrollHeight).toBe(window.innerHeight)
    await writesDuringTheCall(canvasElement, window.innerHeight)
  },
}

export const JoiningOnAPhoneChecks: StoryObj = {
  ...Joining,
  ...atPhone,
  name: 'The call shows above the messages at mobile width, the box still in view (checks)',
  tags: ['play', 'phone', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const bar = await canvas.findByRole('navigation', { name: 'Tabs' })
    const call = (await preview(canvasElement)).getBoundingClientRect()
    const log = (await canvas.findByRole('log')).getBoundingClientRect()
    expect(call.bottom).toBeLessThanOrEqual(log.top + 0.5)
    expect(call.width).toBe(window.innerWidth)
    expect(document.scrollingElement!.scrollHeight).toBe(window.innerHeight)
    await writesDuringTheCall(canvasElement, bar.getBoundingClientRect().top)
  },
}

export const LeaveChecks: StoryObj = {
  ...Joining,
  ...atDesktop,
  name: 'Leave goes back to the conversation alone (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const leave = within(await preview(canvasElement)).getByRole('link', { name: 'Leave' })
    expect(leave).toHaveAttribute('href', '/channels/1')
    await userEvent.click(leave)
    await waitFor(() => expect(canvas.queryByRole('region', { name: 'Your camera before you join' })).toBeNull())
    expect(await canvas.findByRole('link', { name: 'Start call' })).toBeVisible()
  },
}

export const WithThreadChecks: StoryObj = {
  ...JoiningWithThread,
  ...atDesktop,
  name: 'With a thread open, the call, the messages and the thread sit side by side, and the call stays (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const panel = await canvas.findByRole('complementary', { name: 'Thread' })
    await within(panel).findByText('Morning Sam')
    const call = (await preview(canvasElement)).getBoundingClientRect()
    const conversation = canvas.getAllByRole('log')[0]!
    const log = conversation.getBoundingClientRect()
    expect(call.right).toBeLessThanOrEqual(log.left + 0.5)
    expect(log.right).toBeLessThanOrEqual(panel.getBoundingClientRect().left + 0.5)
    // Opening and closing a thread keeps the call
    expect(within(conversation).getByRole('link', { name: '1 reply' })).toHaveAttribute('href', '/channels/1?call=join&thread=1')
    await userEvent.click(within(panel).getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(canvas.queryByRole('complementary', { name: 'Thread' })).toBeNull())
    expect(await preview(canvasElement)).toBeVisible()
  },
}

export const WithThreadOnAPhoneChecks: StoryObj = {
  ...JoiningWithThread,
  ...atPhone,
  name: 'With a thread open at mobile width, the thread covers the call, which goes on under it (checks)',
  tags: ['play', 'phone', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const panel = await canvas.findByRole('complementary', { name: 'Thread' })
    await within(panel).findByText('Morning Sam')
    const box = panel.getBoundingClientRect()
    expect(box.left).toBe(0)
    expect(box.top).toBe(0)
    expect(box.width).toBe(window.innerWidth)
    expect(await preview(canvasElement)).toBeInTheDocument()
    await userEvent.click(within(panel).getByRole('button', { name: 'Close' }))
    expect(await preview(canvasElement)).toBeVisible()
  },
}
