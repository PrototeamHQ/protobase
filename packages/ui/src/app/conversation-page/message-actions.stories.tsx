import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, fireEvent, userEvent, waitFor, within } from 'storybook/test'
import { ApiError, createStaticSession, type Client, type AuthSession, type LiveHandlers, type OrganizationPerson } from '@protobase/client'
import { f, resource, view } from '@protobase/schema'
import { App } from '../app'
import { fakeApi } from '../testing/fake-api'

const meta = { title: 'Record page/Conversation page/Message actions', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

// A channel whose conversation lets people react, edit their own messages, delete those nobody replied to, and reply in
// threads, configured with no component of the app's own

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
    edited_at: f.timestamp().readOnly().optional(),
    reply_count: f.integer().readOnly(),
    last_reply_at: f.timestamp().readOnly().optional(),
  })
  .primaryKey((r) => r.id)
  .author((r) => r.author_id)
  .live()

const reactions = resource('reactions')
  .table('reactions')
  .fields({ id: f.integer().readOnly().filterable(), message_id: f.relation('messages').filterable(), user_id: f.text().readOnly(), emoji: f.enum(['thumbs_up', 'heart', 'party']) })
  .primaryKey((r) => r.id)
  .author((r) => r.user_id)
  .live()

const labels = { thumbs_up: { symbol: '👍', name: 'Thumbs up' }, heart: { symbol: '❤️', name: 'Heart' }, party: { symbol: '🎉', name: 'Party' } }

const channelsView = view<typeof channels>('channels')
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
      edited: 'edited_at',
      mentions: 'mentions',
      edit: true,
      delete: { unless: 'reply_count > 0' },
      reactions: { resource: 'reactions', field: 'message_id', user: 'user_id', emoji: 'emoji', labels },
      thread: { field: 'thread_id', count: 'reply_count', last: 'last_reply_at' },
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

const message = (id: number, author: string, body: string, minutes: number, extra: Record<string, unknown> = {}) => ({
  id,
  channel_id: 1,
  thread_id: null,
  author_id: author,
  body,
  mentions: [],
  sent_at: today(9, minutes),
  edited_at: null,
  reply_count: 0,
  last_reply_at: null,
  ...extra,
})

const rows = () => ({
  channels: [
    { id: 1, name: 'general' },
    { id: 2, name: 'random' },
  ],
  messages: [
    message(1, 'u-sam', 'Morning all', 0, { reply_count: 2, last_reply_at: today(9, 20) }),
    message(2, 'u-maya', 'Nice work', 10),
    message(3, 'u-sam', 'Notes at https://example.com/notes', 30),
    message(4, 'u-lin', 'Morning Sam', 15, { thread_id: 1 }),
    message(5, 'u-maya', 'Coffee first', 20, { thread_id: 1 }),
    message(6, 'u-sam', 'Over in random', 25, { channel_id: 2 }),
  ],
  reactions: [
    { id: 1, message_id: 1, user_id: 'u-sam', emoji: 'heart' },
    { id: 2, message_id: 1, user_id: 'u-lin', emoji: 'heart' },
    { id: 3, message_id: 2, user_id: 'u-maya', emoji: 'thumbs_up' },
  ],
})

/** The rows the fake server holds, so a play can check what the page wrote. */
let stored: Record<string, Array<Record<string, unknown>>> = {}

/** Lets through the held save of a message saying "slow", which waits until a play calls it. */
let releaseSlowSave: () => void = () => undefined

// The server's own refusals: a message saying "secret" is not saved, and Sam's messages are not Maya's to delete
const refusal = (detail: string) => new ApiError({ type: 'urn:protobase:problem:forbidden', title: 'Forbidden', status: 403, detail })

// An update that waits for releaseSlowSave when it writes a text saying "slow"
const held =
  (update: Client['update']): Client['update'] =>
  async (resource, key, patch, etag) => {
    if (String((patch as Record<string, unknown>).body).includes('slow')) await new Promise<void>((resolve) => (releaseSlowSave = resolve))
    return update(resource, key, patch, etag)
  }

const Chat = ({ url }: { url: string }) => {
  const [client] = useState(() => {
    const created = fakeApi({
      resources: [channels.toModel(), messages.toModel(), reactions.toModel()],
      views: [channelsView.toModel(channels.toModel()), hidden('messages').toModel(), hidden('reactions').toModel()],
      rows: rows(),
      bottomBar: { label: 'Chat', items: [{ kind: 'resource', resource: 'channels', label: 'Channels' }] },
      // Like the server, a create stamps its author and a message its time; a reply counts on its thread's first message
      beforeWrite: (name, row) => {
        if (name === 'messages' && String(row.body).includes('secret')) throw refusal('Messages may not hold secrets')
        if (name === 'messages' && !row.sent_at) Object.assign(row, { author_id: 'u-maya', sent_at: new Date().toISOString(), edited_at: null, reply_count: 0, last_reply_at: null, thread_id: row.thread_id ?? null })
        if (name === 'reactions' && !row.user_id) row.user_id = 'u-maya'
      },
      afterWrite: (name, row, tables) => {
        if (name !== 'messages' || row.thread_id == null) return
        const first = tables.messages!.find((entry) => entry.id === row.thread_id)!
        Object.assign(first, { reply_count: tables.messages!.filter((entry) => entry.thread_id === row.thread_id).length, last_reply_at: row.sent_at })
      },
    })
    stored = created.rows
    return {
      ...created.client,
      update: held(created.client.update),
      remove: async (...args: Parameters<typeof created.client.remove>) => {
        const [name, key] = args
        if (name === 'messages' && stored.messages!.find((row) => String(row.id) === String(key))?.author_id !== 'u-maya') throw refusal('Only its author deletes a message')
        return created.client.remove(...args)
      },
      live: (_handlers: LiveHandlers) => () => undefined,
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

/** Reactions under the messages, a thread's replies under its first message, and a bar of actions on hover. */
export const MessageActions: StoryObj = { name: 'React, edit, delete and reply in threads', render: () => <Chat url="/channels/1" /> }

/** A thread open beside its conversation, as a link to it opens it. */
export const ThreadOpen: StoryObj = { name: 'A thread open beside its conversation', render: () => <Chat url="/channels/1?thread=1" /> }

// The message's row in the conversation, found by its paragraph's whole text, links included
const rowOf = async (canvasElement: HTMLElement, body: string) => {
  const log = await within(canvasElement).findByRole('log')
  return (await within(log).findByText((_, element) => element?.tagName === 'P' && element.textContent === body)).closest<HTMLElement>('[data-message]')!
}

// The bar over a message, brought up as a keyboard does, by focusing its first control
const barOf = async (canvasElement: HTMLElement, body: string) => {
  const toolbar = within(await rowOf(canvasElement, body)).getByRole('toolbar', { name: 'Message actions' })
  toolbar.querySelector<HTMLElement>('button, a')!.focus()
  return within(toolbar)
}

// Dialogs, sheets and toasts open over the page, outside the story's root
const screen = within(document.body)

// A click of the real mouse, which moves the pointer there first, as a person's does (scripts/play-tests.mjs)
const mouseClick = (element: Element) => {
  const box = element.getBoundingClientRect()
  return (window as unknown as { pbClick: (at: { x: number; y: number; button: string }) => Promise<void> }).pbClick({ x: box.left + box.width / 2, y: box.top + box.height / 2, button: 'left' })
}

export const ReactionChecks: StoryObj = {
  ...MessageActions,
  ...atDesktop,
  name: 'Reaction chips count, name who reacted and toggle your own (checks)',
  tags: ['play', 'mouse', '!dev'],
  play: async ({ canvasElement }) => {
    const first = within(await rowOf(canvasElement, 'Morning all'))
    const heart = await first.findByRole('button', { name: 'Heart: Sam Okafor, Lin Park' })
    expect(heart).toHaveTextContent('2')
    expect(heart).toHaveAttribute('title', 'Sam Okafor, Lin Park')
    expect(heart).toHaveAttribute('aria-pressed', 'false')
    // Another's chip adds Maya's, and her own takes it back
    await userEvent.click(heart)
    await waitFor(() => expect(stored.reactions!.filter((row) => row.message_id === 1 && row.emoji === 'heart')).toHaveLength(3))
    const mine = await first.findByRole('button', { name: 'Heart: Sam Okafor, Lin Park, Maya Jansen' })
    expect(mine).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(mine)
    await waitFor(() => expect(stored.reactions!.filter((row) => row.message_id === 1 && row.emoji === 'heart')).toHaveLength(2))
    // Pointing at a message brings up its bar, which offers the emoji Maya has not reacted with yet
    const toolbar = within(await rowOf(canvasElement, 'Nice work')).getByRole('toolbar', { name: 'Message actions' })
    expect(getComputedStyle(toolbar).opacity).toBe('0')
    expect(within(toolbar).queryByRole('button', { name: 'React with Thumbs up' })).toBeNull()
    await mouseClick(within(toolbar).getByRole('button', { name: 'React with Party' }))
    await waitFor(() => expect(getComputedStyle(toolbar).opacity).toBe('1'))
    await waitFor(() => expect(stored.reactions).toContainEqual(expect.objectContaining({ message_id: 2, user_id: 'u-maya', emoji: 'party' })))
    expect(await within(await rowOf(canvasElement, 'Nice work')).findByRole('button', { name: 'Party: Maya Jansen' })).toBeVisible()
  },
}

export const EditChecks: StoryObj = {
  ...MessageActions,
  ...atDesktop,
  name: 'Edit in place: Enter saves, Shift+Enter a new line, Escape cancels (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // Only Maya's own message offers Edit
    expect((await barOf(canvasElement, 'Notes at https://example.com/notes')).queryByRole('button', { name: 'Edit' })).toBeNull()
    await userEvent.click((await barOf(canvasElement, 'Nice work')).getByRole('button', { name: 'Edit' }))
    const box = await canvas.findByRole('combobox', { name: 'Edit the message' })
    await userEvent.type(box, '{Escape}')
    await waitFor(() => expect(canvas.queryByRole('combobox', { name: 'Edit the message' })).toBeNull())
    await userEvent.click((await barOf(canvasElement, 'Nice work')).getByRole('button', { name: 'Edit' }))
    const again = await canvas.findByRole('combobox', { name: 'Edit the message' })
    await userEvent.type(again, '{Shift>}{Enter}{/Shift}thanks @Sa')
    await userEvent.click(await canvas.findByRole('option', { name: 'Sam Okafor' }))
    await userEvent.type(again, '{Enter}')
    await waitFor(() => expect(stored.messages!.find((row) => row.id === 2)).toMatchObject({ body: 'Nice work\nthanks @Sam Okafor', mentions: ['u-sam'] }))
    await waitFor(() => expect(canvas.queryByRole('combobox', { name: 'Edit the message' })).toBeNull())
    // A refused edit shows the server's reason and changes nothing
    const edited = canvasElement.querySelector<HTMLElement>('[data-message="2"]')!
    const editedBar = within(edited).getByRole('toolbar', { name: 'Message actions' })
    editedBar.querySelector<HTMLElement>('button')!.focus()
    await userEvent.click(within(editedBar).getByRole('button', { name: 'Edit' }))
    const refused = await canvas.findByRole('combobox', { name: 'Edit the message' })
    await userEvent.clear(refused)
    await userEvent.type(refused, 'the secret{Enter}')
    const reason = await screen.findByText('Messages may not hold secrets')
    await waitFor(() => expect(reason).toBeVisible())
    expect(stored.messages!.find((row) => row.id === 2)!.body).toBe('Nice work\nthanks @Sam Okafor')
  },
}

export const EditSavingChecks: StoryObj = {
  ...MessageActions,
  ...atDesktop,
  name: 'Edit keeps its box read-only while it saves, and a late save closes no newer box (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click((await barOf(canvasElement, 'Nice work')).getByRole('button', { name: 'Edit' }))
    const box = await canvas.findByRole<HTMLTextAreaElement>('combobox', { name: 'Edit the message' })
    await userEvent.clear(box)
    await userEvent.type(box, 'slow change{Enter}')
    // Nothing typed while it saves goes in, so nothing is lost when it closes
    await waitFor(() => expect(box).toHaveAttribute('readonly'))
    await userEvent.type(box, ' more')
    expect(box.value).toBe('slow change')
    // Closed and opened again before the save ends, the new box stays open once it does
    await userEvent.type(box, '{Escape}')
    await waitFor(() => expect(canvas.queryByRole('combobox', { name: 'Edit the message' })).toBeNull())
    await userEvent.click((await barOf(canvasElement, 'Nice work')).getByRole('button', { name: 'Edit' }))
    const again = await canvas.findByRole<HTMLTextAreaElement>('combobox', { name: 'Edit the message' })
    expect(again).not.toHaveAttribute('readonly')
    releaseSlowSave()
    await waitFor(() => expect(stored.messages!.find((row) => row.id === 2)!.body).toBe('slow change'))
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(canvas.getByRole('combobox', { name: 'Edit the message' })).toBe(again)
  },
}

export const DeleteChecks: StoryObj = {
  ...MessageActions,
  ...atDesktop,
  name: 'Delete after confirming, unless the message has replies (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // A message with replies is kept
    expect((await barOf(canvasElement, 'Morning all')).queryByRole('button', { name: 'Delete' })).toBeNull()
    // Sam's message offers Delete, but the server refuses it: its reason shows and the message stays
    await userEvent.click((await barOf(canvasElement, 'Notes at https://example.com/notes')).getByRole('button', { name: 'Delete' }))
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Delete this message?' })).getByRole('button', { name: 'Delete' }))
    const reason = await screen.findByText('Only its author deletes a message')
    await waitFor(() => expect(reason).toBeVisible())
    expect(await rowOf(canvasElement, 'Notes at https://example.com/notes')).toBeVisible()
    // Cancel keeps Maya's message, and Delete removes it
    await userEvent.click((await barOf(canvasElement, 'Nice work')).getByRole('button', { name: 'Delete' }))
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Delete this message?' })).getByRole('button', { name: 'Cancel' }))
    expect(stored.messages!.some((row) => row.id === 2)).toBe(true)
    await userEvent.click((await barOf(canvasElement, 'Nice work')).getByRole('button', { name: 'Delete' }))
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Delete this message?' })).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(stored.messages!.some((row) => row.id === 2)).toBe(false))
    await waitFor(() => expect(within(canvas.getByRole('log')).queryByText('Nice work')).toBeNull())
  },
}

export const ThreadChecks: StoryObj = {
  ...MessageActions,
  ...atDesktop,
  name: "The flow hides replies, and a thread's summary opens it beside the conversation (checks)",
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const log = within(await canvas.findByRole('log'))
    await log.findByText('Morning all')
    expect(log.queryByText('Morning Sam')).toBeNull()
    const summary = log.getByRole('link', { name: '2 replies' })
    expect(summary).toHaveAttribute('href', '/channels/1?thread=1')
    expect(log.getByText(/^Last reply Today, /)).toBeVisible()
    // The bar's Reply in thread is a link to the same place
    expect((await barOf(canvasElement, 'Morning all')).getByRole('link', { name: 'Reply in thread' })).toHaveAttribute('href', '/channels/1?thread=1')
    await userEvent.click(summary)
    const panel = within(await canvas.findByRole('complementary', { name: 'Thread' }))
    await panel.findByText('Morning Sam')
    expect(panel.getByText('Coffee first')).toBeVisible()
    // Its own box replies in the thread
    await userEvent.type(panel.getByRole('combobox', { name: 'Message' }), 'On my way{Enter}')
    await waitFor(() => expect(stored.messages!.at(-1)).toMatchObject({ channel_id: 1, thread_id: 1, body: 'On my way' }))
    await userEvent.click(panel.getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(canvas.queryByRole('complementary', { name: 'Thread' })).toBeNull())
  },
}

export const ThreadElsewhereChecks: StoryObj = {
  ...atDesktop,
  name: 'A thread of another conversation shows as not found, with no box to reply (checks)',
  tags: ['play', '!dev'],
  render: () => <Chat url="/channels/1?thread=6" />,
  play: async ({ canvasElement }) => {
    const panel = within(await within(canvasElement).findByRole('complementary', { name: 'Thread' }))
    expect(await panel.findByText('This thread is not in this conversation')).toBeVisible()
    expect(panel.queryByText('Over in random')).toBeNull()
    expect(panel.queryByRole('combobox', { name: 'Message' })).toBeNull()
  },
}

export const ThreadOnAPhoneChecks: StoryObj = {
  ...ThreadOpen,
  ...atPhone,
  name: 'A thread covers the screen at mobile width (checks)',
  tags: ['play', 'phone', '!dev'],
  play: async ({ canvasElement }) => {
    const panel = await within(canvasElement).findByRole('complementary', { name: 'Thread' })
    await within(panel).findByText('Morning Sam')
    const box = panel.getBoundingClientRect()
    expect(box.left).toBe(0)
    expect(box.top).toBe(0)
    expect(box.width).toBe(window.innerWidth)
    expect(box.bottom).toBeCloseTo(window.innerHeight, 0)
    expect(within(panel).getByRole('combobox', { name: 'Message' })).toBeVisible()
  },
}

// A finger's press on a point, held for `ms`, through the browser's own input (scripts/play-tests/touch-input.mjs)
const press = (at: { x: number; y: number; ms: number }) => (window as unknown as { pbPress: (at: { x: number; y: number; ms: number }) => Promise<void> }).pbPress(at)

// The next time an event of `type` has gone all the way through the page, its own handlers done
const after = (type: 'click' | 'touchend') => new Promise<void>((resolve) => window.addEventListener(type, () => setTimeout(resolve), { once: true }))

// A finger's tap on a point, done once the page has handled its click, so the next press never meets a finger still down
const tap = async (at: { x: number; y: number }) => {
  const clicked = after('click')
  await press({ ...at, ms: 60 })
  await clicked
}

// A point on a message, beside its author's avatar and off its links
const pointOn = (element: Element) => {
  const box = element.getBoundingClientRect()
  return { x: box.left + 8, y: box.top + 8 }
}

export const TouchChecks: StoryObj = {
  ...MessageActions,
  ...atPhone,
  name: 'By touch, a tap or long-press opens every action in a sheet (checks)',
  tags: ['play', 'touch', 'phone', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const row = await rowOf(canvasElement, 'Nice work')
    // A long-press opens it while the finger rests
    const lifted = after('touchend')
    await press({ ...pointOn(row), ms: 800 })
    const sheet = within(await screen.findByRole('dialog', { name: 'Your message' }, { timeout: 2000 }))
    expect(sheet.getAllByRole('button', { name: /^React with / })).toHaveLength(3)
    expect(sheet.getByRole('button', { name: 'React with Thumbs up' })).toHaveAttribute('aria-pressed', 'true')
    for (const name of ['Copy text', 'Edit', 'Delete']) expect(sheet.getByRole('button', { name })).toBeVisible()
    expect(sheet.getByRole('link', { name: 'Reply in thread' })).toHaveAttribute('href', '/channels/1?thread=2')
    // Copy text copies the message and closes the sheet
    const copied: string[] = []
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (value: string) => void copied.push(value) } })
    await userEvent.click(sheet.getByRole('button', { name: 'Copy text' }))
    await waitFor(() => expect(copied).toEqual(['Nice work']))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Your message' })).toBeNull())
    await lifted
    // While the reader types, a tap only lowers the keyboard; then a tap opens it too, and an emoji in it reacts
    const morning = pointOn(await rowOf(canvasElement, 'Morning all'))
    screen.getByRole('combobox', { name: 'Message' }).focus()
    await tap(morning)
    expect(document.activeElement).not.toBe(screen.getByRole('combobox', { name: 'Message' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    await tap(morning)
    const other = within(await screen.findByRole('dialog', { name: 'Message from Sam Okafor' }, { timeout: 2000 }))
    expect(other.queryByRole('button', { name: 'Edit' })).toBeNull()
    expect(other.queryByRole('button', { name: 'Delete' })).toBeNull()
    await userEvent.click(other.getByRole('button', { name: 'React with Party' }))
    await waitFor(() => expect(stored.reactions).toContainEqual(expect.objectContaining({ message_id: 1, user_id: 'u-maya', emoji: 'party' })))
    // A link in a message keeps its own tap
    const link = within(await rowOf(canvasElement, 'Notes at https://example.com/notes')).getByRole('link', { name: 'https://example.com/notes' })
    link.addEventListener('click', (event) => event.preventDefault())
    const box = link.getBoundingClientRect()
    await tap({ x: box.left + 4, y: box.top + box.height / 2 })
    expect(screen.queryByRole('dialog')).toBeNull()
  },
}

export const TouchKeyboardChecks: StoryObj = {
  ...MessageActions,
  ...atPhone,
  name: 'On a touch screen, a keyboard or screen reader reaches the actions by a button of its own (checks)',
  tags: ['play', 'phone', '!dev'],
  play: async ({ canvasElement }) => {
    const row = within(await rowOf(canvasElement, 'Nice work'))
    // Out of sight until focused, and shown in place of the bar on a screen that cannot point
    const open = row.getByText('Show actions for your message').closest('button')!
    expect(open).toHaveClass('sr-only', '[@media(hover:hover)]:hidden')
    fireEvent.click(open)
    expect(await screen.findByRole('dialog', { name: 'Your message' })).toBeVisible()
  },
}
