import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, within } from 'storybook/test'
import { createStaticSession, type AuthSession, type Client } from '@protobase/client'
import type { ShellLogoProps } from '../app-shell'
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

/** The caller's bottom bar from `/meta`, on a phone: its tabs under their own labels, then "More". */
export const BottomBarFromMeta: StoryObj = {
  tags: ['play', 'phone'],
  parameters: { viewport: { options: { phone390: { name: 'Phone 390', styles: { width: '390px', height: '844px' }, type: 'mobile' } } } },
  globals: { viewport: { value: 'phone390' } },
  render: () => (
    <div className="h-screen">
      <App
        client={fakeClient({ permissions: allowed, bottomBar: { label: 'Sales', items: [{ kind: 'resource', resource: 'orders', label: 'My orders' }, { kind: 'link', label: 'Help', href: 'https://docs.protobase.net', icon: 'life-buoy' }] } })}
        auth={session}
        initialUrl="/orders"
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const bar = await canvas.findByRole('navigation', { name: 'Tabs' })
    expect(within(bar).getAllByRole('link').map((link) => link.textContent)).toEqual(['My orders', 'Help'])
    expect(within(bar).getByRole('link', { name: 'My orders' })).toHaveAttribute('aria-current', 'page')
    await userEvent.click(within(bar).getByRole('button', { name: 'More' }))
    await canvas.findByRole('dialog', { name: 'Navigation' })
  },
}

const recordOnPhone = (permissions: typeof allowed) => () => (
  <div className="h-screen">
    <App client={fakeClient({ permissions, bottomBar: { label: 'Sales', items: [{ kind: 'resource', resource: 'orders', label: 'My orders' }] } })} auth={session} initialUrl="/orders/o1" />
  </div>
)

/** The bottom bar is at the foot of the screen, with nothing drawn over its top or bottom edge. */
const expectWholeBar = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement)
  await canvas.findByRole('heading', { name: 'SO-1' })
  const bar = canvas.getByRole('navigation', { name: 'Tabs' })
  const edges = bar.getBoundingClientRect()
  expect(edges.bottom).toBeCloseTo(window.innerHeight, 0)
  for (const y of [edges.top + 1, edges.bottom - 1]) expect(document.elementFromPoint(edges.left + edges.width / 2, y)?.closest('nav')).toBe(bar)
  return edges
}

/** A record page on a phone: Save and Delete sit above the bottom bar, which stays whole. */
export const BottomBarOnRecordPage: StoryObj = {
  ...BottomBarFromMeta,
  tags: ['play', 'phone'],
  render: recordOnPhone(allowed),
  play: async ({ canvasElement }) => {
    const bar = await expectWholeBar(canvasElement)
    expect(within(canvasElement).getByRole('button', { name: 'Save' }).getBoundingClientRect().bottom).toBeLessThanOrEqual(bar.top)
  },
}

/** A record the user can neither change nor delete: no controls, and no empty strip over the bottom bar. */
export const BottomBarOnReadOnlyRecord: StoryObj = {
  ...BottomBarFromMeta,
  tags: ['play', 'phone'],
  render: recordOnPhone({ create: false, update: false, delete: false, conditional: [] }),
  play: async ({ canvasElement }) => {
    await expectWholeBar(canvasElement)
    expect(within(canvasElement).queryByRole('button', { name: 'Save' })).toBeNull()
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

// A project's own logo: its initials alone in a compact sidebar, its name beside them otherwise.
const RijnlandLogo = ({ compact }: ShellLogoProps) => (
  <div className="flex items-center gap-2.5">
    <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-[11px] font-bold text-primary-foreground">RI</span>
    {!compact && <span className="text-[13px] font-semibold">Rijnland Industrial</span>}
  </div>
)

/** The project's `shell.logo` from `protobase.ui.tsx`, at the top of the sidebar in place of Protobase's. */
export const ProjectLogo: StoryObj = {
  tags: ['play'],
  render: () => (
    <div className="h-screen">
      <App client={fakeClient({ permissions: allowed })} auth={session} initialUrl="/orders" ui={{ shell: { logo: RijnlandLogo } }} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByText('Rijnland Industrial')
    expect(canvas.queryByRole('img', { name: 'Protobase' })).toBeNull()
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
  tags: ['play'],
  render: StaffSession.render,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const banner = await canvas.findByRole('region', { name: 'Staff session' })
    await userEvent.click(within(banner).getByRole('button', { name: 'Stop staff session' }))
    await canvas.findByRole('button', { name: 'Sign in' })
    expect(canvas.queryByRole('region', { name: 'Staff session' })).toBeNull()
  },
}
