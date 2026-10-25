import type { Meta, StoryObj } from '@storybook/react-vite'
import { CreditCard, LifeBuoy, UserRound } from 'lucide-react'
import { expect, fn, userEvent, within } from 'storybook/test'
import { AppShell } from './app-shell'
import { navGroups, type NavGroup, type NavRecord } from './nav'
import { navOpenStorageKey } from './nav-open-storage'
import { sidebarModes } from './sidebar-mode'
import type { ProfileMenuItem, ShellUser } from './profile-menu'

const sampleUser: ShellUser = { name: 'Sample User', email: 'sample@example.test', initials: 'SU', hue: 250, role: 'Admin', roleTone: 'violet' }

const meta = {
  title: 'Components/AppShell',
  component: AppShell,
  parameters: { layout: 'fullscreen' },
  argTypes: { sidebarMode: { control: 'select', options: sidebarModes } },
  args: { sidebarMode: 'text-small', activeItem: 'orders', breadcrumb: ['Sales', 'Orders'], user: sampleUser, workspace: 'Veldhuis Supply', children: null },
  render: (args) => (
    <div className="h-screen">
      <AppShell {...args}>
        <div className="p-6 text-muted-foreground">Page content</div>
      </AppShell>
    </div>
  ),
} satisfies Meta<typeof AppShell>

export default meta
type Story = StoryObj<typeof meta>

export const TextLarge: Story = { args: { sidebarMode: 'text-large' } }
export const TextSmall: Story = { args: { sidebarMode: 'text-small' } }
export const Icon: Story = { args: { sidebarMode: 'icon' } }
export const IconLabel: Story = { args: { sidebarMode: 'icon-label' } }
export const IconTooltip: Story = { args: { sidebarMode: 'icon-tooltip' } }
export const IconExpand: Story = { args: { sidebarMode: 'icon-expand' } }
export const ProfileMenuOpen: Story = { args: { profileMenuOpen: true } }

const record = (id: string, label: string, status: string, tone: NavRecord['tone'], pulse = false, active = false): NavRecord => ({ id, label, href: `#orders/${id}`, status, tone, pulse, active })

const recentOrders = [record('o1', 'SO-1042', 'picking', 'warning', true), record('o2', 'SO-1041', 'confirmed', 'info', false, true), record('o3', 'SO-1038', 'on hold', 'danger')]

const withRecent: NavGroup[] = navGroups.map((group) => ({
  ...group,
  items: group.items.map((item) =>
    item.id === 'orders' ? { ...item, count: undefined, recent: { state: 'ready', records: recentOrders } } : item.id === 'invoices' ? { ...item, count: undefined, recent: { state: 'loading' } } : item.id === 'shipments' ? { ...item, recent: { state: 'error' } } : item,
  ),
}))

const accountItems: ProfileMenuItem[][] = [
  [
    { id: 'billing', label: 'Billing', icon: CreditCard, href: '#billing', active: true },
    { id: 'support', label: 'Support', icon: LifeBuoy, href: 'mailto:help@example.test', external: true },
  ],
  [],
  [{ id: 'account', label: 'Account', icon: UserRound, href: '#account' }],
]

/** Orders lists three records with status dots (picking pulses), invoices are loading and shipments failed to load. */
export const RecentRecords: Story = {
  tags: ['play'],
  args: { navGroups: withRecent, activeItem: 'orders' },
  beforeEach: () => localStorage.removeItem(navOpenStorageKey('orders')),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const toggle = canvas.getByRole('button', { name: 'Recent orders' })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    const list = canvas.getByRole('list', { name: 'Recent orders' })
    const links = within(list).getAllByRole('link')
    expect(links.map((link) => link.getAttribute('aria-label') ?? link.textContent)).toEqual(['SO-1042, picking', 'SO-1041, confirmed', 'SO-1038, on hold', 'View all'])
    expect(links[0]!.querySelector('[data-tone="warning"][data-pulse]')).not.toBeNull()
    expect(links[1]).toHaveAttribute('aria-current', 'page')
    expect(links[3]).toHaveAttribute('href', '#orders')
    expect(canvas.getByRole('link', { name: 'Orders' })).toHaveAttribute('href', '#orders')
    expect(canvas.getByRole('list', { name: 'Recent invoices' })).toHaveTextContent('Loading...')
    expect(canvas.getByRole('list', { name: 'Recent shipments' })).toHaveTextContent('Could not load')

    await userEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(canvas.queryByRole('list', { name: 'Recent orders' })).toBeNull()
    expect(localStorage.getItem(navOpenStorageKey('orders'))).toBe('false')
    await userEvent.click(toggle)
    expect(localStorage.getItem(navOpenStorageKey('orders'))).toBeNull()
  },
}

/** Icon sidebars have no room for records: the entry stays a plain link. */
export const RecentRecordsIcon: Story = {
  tags: ['play'],
  args: { navGroups: withRecent, sidebarMode: 'icon' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(canvas.getByRole('link', { name: 'Orders' })).toBeVisible()
    expect(canvas.queryByRole('button', { name: 'Recent orders' })).toBeNull()
  },
}

/** The app's own pages above "Sign out", a line between groups and none for an empty one; Support opens a new tab, the name opens the account. */
export const UserMenuItems: Story = {
  tags: ['play'],
  args: { userMenu: accountItems, account: '#account', onSignOut: () => undefined, onNavigate: fn() },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Profile menu' }))
    const menu = await canvas.findByRole('menu')
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Sample Usersample@example.test', 'Billing', 'Support', 'Account', 'Sign out'])
    expect(within(menu).getAllByRole('group').map((group) => within(group).getAllByRole('menuitem').map((item) => item.textContent))).toEqual([['Billing', 'Support'], ['Account']])
    expect(within(menu).getByRole('menuitem', { name: 'Billing' })).toHaveAttribute('aria-current', 'page')
    expect(within(menu).getByRole('menuitem', { name: 'Support' })).toHaveAttribute('target', '_blank')
    await userEvent.click(within(menu).getByRole('menuitem', { name: /Sample User/ }))
    expect(args.onNavigate).toHaveBeenCalledWith('#account')
    expect(canvas.queryByRole('menu')).toBeNull()
  },
}

/** Crumbs with an href are links: a plain click navigates in the app, a modified click is left to the browser (a new tab). */
export const BreadcrumbLinks: Story = {
  tags: ['play'],
  args: { breadcrumb: ['Sales', { label: 'Orders', href: '#orders' }, { label: 'SO-1042', href: '#orders/o1' }], onNavigate: fn() },
  play: async ({ args, canvasElement }) => {
    const trail = within(within(canvasElement).getByRole('navigation', { name: 'Breadcrumb' }))
    expect(trail.getByText('Sales').closest('a')).toBeNull()
    const orders = trail.getByRole('link', { name: 'Orders' })
    expect(orders).toHaveAttribute('href', '#orders')
    expect(orders).not.toHaveAttribute('aria-current')
    expect(trail.getByRole('link', { name: 'SO-1042' })).toHaveAttribute('aria-current', 'page')

    await userEvent.click(orders)
    expect(args.onNavigate).toHaveBeenCalledWith('#orders')
    const opened = new MouseEvent('click', { bubbles: true, cancelable: true, metaKey: true })
    orders.dispatchEvent(opened)
    expect(opened.defaultPrevented).toBe(false)
    expect(args.onNavigate).toHaveBeenCalledTimes(1)
  },
}

/**
 * A page that scrolls in its own box keeps the document the screen's height: text kept for screen readers far down the
 * box, positioned with sr-only, is clipped with the box instead of making the document taller, which otherwise scrolls
 * the shell up past the bottom of the screen and leaves blank space below it.
 */
export const ScrollBoxKeepsDocumentHeight: Story = {
  tags: ['play'],
  render: (args) => (
    <div className="h-screen">
      <AppShell {...args}>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="h-[3000px] p-6 text-muted-foreground">Tall page content</div>
          <a href="#listings">
            View all <span className="sr-only">listings</span>
          </a>
        </div>
      </AppShell>
    </div>
  ),
  play: async () => {
    expect(document.documentElement.scrollHeight).toBe(document.documentElement.clientHeight)
  },
}
