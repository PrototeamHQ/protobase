import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, within } from 'storybook/test'
import { createStaticSession, type AuthSession, type Client } from '@protobase/client'
import { navOpenStorageKey } from '../app-shell/nav-open-storage'
import { useRecord } from '../data/use-record'
import { Button } from '../primitives/button'
import { SidePanel } from '../side-panel'
import { App } from './app'
import { fakeAssistant } from './testing/fake-assistant'
import { fakeClient } from './testing/fake-client'
import { fakeRuntime } from './testing/fake-runtime'

const meta = { title: 'Shell', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'story', email: 'story@example.test', name: 'Story User', role: 'user' })
const allowed = { create: true, update: true, delete: true, conditional: [] }

/** `nav.recent` and `userMenu` from `/meta`, rendered by the real app: records with status dots, then the user menu. */
export const RecentAndUserMenu: StoryObj = {
  tags: ['play'],
  beforeEach: () => localStorage.removeItem(navOpenStorageKey('orders')),
  render: () => (
    <div className="h-screen">
      <App
        client={fakeClient({
          permissions: allowed,
          nav: { recent: { status: 'status', tones: { draft: 'neutral', shipped: 'success' }, pulse: ['draft'] } },
          userMenu: { items: [{ kind: 'link', label: 'Support', href: 'mailto:help@example.test', icon: 'life-buoy' }] },
        })}
        auth={session}
        initialUrl="/orders"
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const list = await canvas.findByRole('list', { name: 'Recent orders' })
    await within(list).findByRole('link', { name: 'SO-1, Draft' })
    expect(within(list).getAllByRole('link').map((link) => link.getAttribute('aria-label') ?? link.textContent)).toEqual(['SO-1, Draft', 'SO-2, Shipped', 'SO-3, Shipped', 'View all'])
    expect(within(list).getByRole('link', { name: 'SO-1, Draft' }).querySelector('[data-tone="neutral"][data-pulse]')).not.toBeNull()
    expect(within(list).getByRole('link', { name: 'SO-2, Shipped' }).querySelector('[data-tone="success"]')).not.toBeNull()

    await userEvent.click(within(list).getByRole('link', { name: 'SO-2, Shipped' }))
    await canvas.findByRole('heading', { name: 'SO-2' })
    expect(within(list).getByRole('link', { name: 'SO-2, Shipped' })).toHaveAttribute('aria-current', 'page')

    await userEvent.click(within(list).getByRole('link', { name: 'View all' }))
    await canvas.findByRole('button', { name: /New order/ })

    await userEvent.click(canvas.getByRole('button', { name: 'Profile menu' }))
    const menu = await canvas.findByRole('menu')
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Support', 'Sign-in & security', 'Sign out'])
  },
}

/** A server whose first order ships between reads, and a top-bar button that reads it anew, as an app following a record does. */
const shippingClient = () => {
  let shipped = false
  const base = fakeClient({ permissions: allowed, nav: { recent: { status: 'status', tones: { draft: 'neutral', shipped: 'success' } } } })
  const ship = <T extends Record<string, unknown>>(row: T) => (shipped && row.id === 'o1' ? { ...row, status: 'shipped' } : row)
  const client = {
    ...base,
    list: async (...args: Parameters<Client['list']>) => {
      const page = await base.list(...args)
      return { ...page, items: page.items.map(ship) }
    },
    get: async (...args: Parameters<Client['get']>) => {
      const stored = await base.get(...args)
      return { ...stored, record: ship(stored.record) }
    },
  } as unknown as Client
  return { client, ship: () => (shipped = true) }
}

const CheckFirstOrder = () => {
  const { refetch } = useRecord('orders', 'o1')
  return <Button size="sm" onClick={() => void refetch()}>Check SO-1</Button>
}

/** A record read anew with another status than its sidebar row refreshes that group, without a write or window focus. */
export const RecentFollowsRecordReads: StoryObj = {
  tags: ['play'],
  render: function Render() {
    const [server] = useState(shippingClient)
    return (
      <div className="h-screen">
        <button type="button" className="sr-only" onClick={server.ship}>Ship SO-1</button>
        <App client={server.client} auth={session} initialUrl="/orders" ui={{ shell: { actions: CheckFirstOrder } }} />
      </div>
    )
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const list = await canvas.findByRole('list', { name: 'Recent orders' })
    await within(list).findByRole('link', { name: 'SO-1, Draft' })
    await userEvent.click(canvas.getByRole('button', { name: 'Ship SO-1' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Check SO-1' }))
    await within(list).findByRole('link', { name: 'SO-1, Shipped' })
  },
}

/** The project's `shell` slots from `protobase.ui.tsx`: a top-bar action, and a side panel as the right panel. */
export const ProjectShellSlots: StoryObj = {
  tags: ['play'],
  render: () => (
    <div className="h-screen">
      <App
        client={fakeClient({ permissions: allowed })}
        auth={session}
        initialUrl="/orders"
        ui={{ shell: { actions: () => <Button size="sm">Notes</Button>, rightPanel: () => <SidePanel title="Notes"><p className="p-4 text-[13px]">Pinned notes for this team.</p></SidePanel> } }}
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByRole('button', { name: 'Notes' })
    within(canvas.getByRole('complementary', { name: 'Notes' })).getByText('Pinned notes for this team.')
    expect(canvas.queryByRole('button', { name: 'Assistant' })).toBeNull()
  },
}

/** `/meta` names an assistant (for an admin or ai user): the top bar gets an Assistant button that opens the dock. */
export const Assistant: StoryObj = {
  tags: ['play'],
  render: () => (
    <div className="h-screen">
      <App client={fakeClient({ permissions: allowed, assistant: { url: '/api/assistant' } })} auth={session} initialUrl="/orders" assistant={fakeAssistant({ delayMs: 50 })} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const button = await canvas.findByRole('button', { name: 'Assistant' })
    expect(canvas.queryByRole('complementary', { name: 'Assistant' })).toBeNull()
    await userEvent.click(button)
    const dock = canvas.getByRole('complementary', { name: 'Assistant' })
    await userEvent.type(within(dock).getByRole('textbox', { name: 'Message' }), 'Add a discount to invoices{Enter}')
    await within(dock).findByRole('button', { name: 'Approve' })
    await userEvent.click(within(dock).getByRole('button', { name: 'Close' }))
    expect(canvas.queryByRole('complementary', { name: 'Assistant' })).toBeNull()
  },
}

/** `/meta` names a runtime endpoint (for an admin) that reports an update: the top bar gets a subtle Update button beside the Assistant. */
export const RuntimeUpdate: StoryObj = {
  render: () => (
    <div className="h-screen">
      <App client={fakeClient({ permissions: allowed, assistant: { url: '/api/assistant' }, runtime: { url: '/runtime' } })} auth={session} initialUrl="/orders" assistant={fakeAssistant({ delayMs: 50 })} runtime={fakeRuntime()} />
    </div>
  ),
}

// Signed in as Sanne by staff of the operator, for support; stopping ends the session.
const staffSession = (): AuthSession => {
  const sanne = createStaticSession('story-token', { id: 'sanne', email: 'sanne@veldhuis-supply.example', name: 'Sanne', role: 'user' })
  const signIn = {
    id: 's1',
    user: 'sanne@veldhuis-supply.example',
    staff: 'alex@protobase.example',
    staffName: 'Alex de Vries',
    reason: 'Ticket 4211: the invoice totals on SO-2 look wrong',
    startedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    expiresAt: new Date(Date.now() + 25 * 60_000).toISOString(),
  }
  let stopped = false
  return {
    ...sanne,
    session: async () => (stopped ? undefined : sanne.session()),
    staff: { ...sanne.staff, current: async () => (stopped ? undefined : signIn), stop: async () => void (stopped = true) },
  }
}

/** Staff of the operator signed in as someone: a banner above the whole app says who, as whom and why. */
export const StaffSession: StoryObj = {
  tags: ['play'],
  render: () => (
    <div className="h-screen">
      <App client={fakeClient({ permissions: allowed })} auth={staffSession()} initialUrl="/orders" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const banner = await within(canvasElement).findByRole('region', { name: 'Staff session' })
    expect(banner).toHaveTextContent('Alex de Vries is signed in as sanne@veldhuis-supply.example')
    expect(banner).toHaveTextContent('Reason: Ticket 4211')
  },
}

/** The banner's button ends the staff session: back to the sign-in page, without the banner. */
export const StopStaffSession: StoryObj = {
  ...StaffSession,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const banner = await canvas.findByRole('region', { name: 'Staff session' })
    await userEvent.click(within(banner).getByRole('button', { name: 'Stop staff session' }))
    await canvas.findByRole('button', { name: 'Sign in' })
    expect(canvas.queryByRole('region', { name: 'Staff session' })).toBeNull()
  },
}
