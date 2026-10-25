import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { createStaticSession } from '@protobase/client'
import { App } from '../../app/app'
import { fakeClient } from '../../app/testing/fake-client'
import { NotificationPanel, type NotificationPanelProps } from './notification-panel'
import { notificationTarget } from './notification-target'
import { PushControl } from './push-control'
import { fakeInbox, inboxNote } from '../../app/testing/fake-inbox'

const meta = { title: 'Shell/Notification bell', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'story', email: 'story@example.test', name: 'Story User', role: 'user' })
const allowed = { create: true, update: true, delete: true, conditional: [] }

const notes = [
  inboxNote('n1', 2, { title: 'SO-2 was shipped', body: 'The carrier picked it up this morning.', url: '/orders/o2' }),
  inboxNote('n2', 50, { title: 'The price list for next year is ready', url: 'https://docs.example.com/prices' }),
  inboxNote('n3', 60 * 26, { title: 'Welcome to the app', body: 'Turn on notifications to hear about your orders on this device.' }),
  inboxNote('n4', 60 * 24 * 3, { title: 'SO-1 is waiting for you', url: '/orders/o1', read: true }),
]

// The panel as the bell's popover draws it, with nothing to follow.
const panel = (props: Partial<NotificationPanelProps>) => () => (
  <div className="p-4">
    <div className="w-[22rem] rounded-md border bg-background shadow-pop">
      <NotificationPanel
        items={notes}
        loading={false}
        failed={false}
        onRetry={() => undefined}
        hasMore={false}
        loadingMore={false}
        onMore={() => undefined}
        onMarkAllRead={() => undefined}
        markingAll={false}
        targetOf={(item) => notificationTarget(item.url, { origin: window.location.origin, basePath: '' })}
        onNavigate={() => undefined}
        onOpen={() => undefined}
        footer={<PushControl state="off" onTurnOn={() => undefined} onTurnOff={() => undefined} />}
        now={Date.now()}
        {...props}
      />
    </div>
  </div>
)

/** Unread notifications in bold beside a dot, read ones without, each with how long ago it came; push can be turned on. */
export const Panel: StoryObj = {
  tags: ['play'],
  render: panel({ hasMore: true }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(canvas.getAllByText('Unread')).toHaveLength(3)
    expect(canvas.getByRole('button', { name: 'Mark all as read' })).toBeVisible()
    expect(canvas.getByRole('button', { name: 'Show more' })).toBeVisible()
    expect(canvas.getByRole('link', { name: /SO-2 was shipped/ })).toHaveAttribute('href', '/orders/o2')
    const external = canvas.getByRole('link', { name: /price list.*opens in a new tab/ })
    expect(external).toHaveAttribute('target', '_blank')
    expect(external).toHaveAttribute('rel', 'noopener')
    expect(canvas.queryByRole('link', { name: /Welcome/ })).toBeNull()
    expect(canvas.getByRole('button', { name: 'Turn on' })).toBeVisible()
  },
}

/** Everything read, and push on for this device with a way to turn it off. */
export const AllRead: StoryObj = {
  render: panel({ items: notes.map((item) => ({ ...item, readAt: item.readAt ?? item.createdAt })), footer: <PushControl state="on" onTurnOn={() => undefined} onTurnOff={() => undefined} /> }),
}

/** Nothing yet, and push blocked on this device, with how to allow it. */
export const Empty: StoryObj = {
  render: panel({ items: [], footer: <PushControl state="blocked" onTurnOn={() => undefined} onTurnOff={() => undefined} /> }),
}

/** The history could not be read. */
export const Failed: StoryObj = {
  render: panel({ items: [], failed: true }),
}

/** The bell in the app's top bar with three unread notifications. */
export const Unread: StoryObj = {
  render: () => (
    <div className="h-screen">
      <App client={fakeClient({ permissions: allowed, inbox: fakeInbox(notes) })} auth={session} initialUrl="/orders" />
    </div>
  ),
}

/**
 * The bell in the app's top bar: its count, the panel it opens, an own page followed in the app, which marks it read,
 * and "Mark all as read".
 */
export const InTheApp: StoryObj = {
  tags: ['play'],
  render: () => (
    <div className="h-screen">
      <App client={fakeClient({ permissions: allowed, inbox: fakeInbox(notes) })} auth={session} initialUrl="/orders" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const page = within(document.body)
    await userEvent.click(await canvas.findByRole('button', { name: 'Notifications, 3 unread' }))
    const dialog = await page.findByRole('dialog', { name: 'Notifications' })
    await userEvent.click(await within(dialog).findByRole('link', { name: /SO-2 was shipped/ }))
    await canvas.findByRole('heading', { name: 'SO-2' })
    expect(page.queryByRole('dialog')).toBeNull()
    await userEvent.click(await canvas.findByRole('button', { name: 'Notifications, 2 unread' }))
    await userEvent.click(await within(await page.findByRole('dialog')).findByRole('button', { name: 'Mark all as read' }))
    await waitFor(() => expect(canvas.getByRole('button', { name: 'Notifications' })).toBeVisible())
  },
}

const OwnBell = () => <button type="button">Our inbox</button>

/** A project's `shell.bell` in place of the built-in bell. */
export const OwnSlot: StoryObj = {
  tags: ['play'],
  render: () => (
    <div className="h-screen">
      <App client={fakeClient({ permissions: allowed, inbox: fakeInbox(notes) })} auth={session} initialUrl="/orders" ui={{ shell: { bell: OwnBell } }} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByRole('button', { name: 'Our inbox' })
    expect(canvas.queryByRole('button', { name: /^Notifications/ })).toBeNull()
  },
}

/** `notifications({ ui: false })`, or none at all: `/meta` names no bell, and the top bar has none. */
export const WithoutTheBell: StoryObj = {
  tags: ['play'],
  render: () => (
    <div className="h-screen">
      <App client={fakeClient({ permissions: allowed })} auth={session} initialUrl="/orders" ui={{ shell: { bell: OwnBell } }} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByRole('link', { name: /New order/ })
    expect(canvas.queryByRole('button', { name: /^Notifications|Our inbox/ })).toBeNull()
  },
}
