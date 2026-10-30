import type { Meta, StoryObj } from '@storybook/react-vite'
import { createStaticSession } from '@protobase/client'
import { ArrowLeftRight, Boxes, LifeBuoy, ShoppingCart, StickyNote } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { AppShell, type BottomBarTab } from './app-shell'
import { withDirectMessages } from './app-shell/direct-messages-fixtures'
import { navOpenStorageKey } from './app-shell/nav-open-storage'
import { App } from './app/app'
import { AssistantButton } from './app/assistant-shell'
import { AssistantDock } from './assistant-dock'
import { conversation } from './assistant-dock/fixtures'
import { adminUser } from './website/users'
import { ConflictDialog } from './app/delete/dialogs'
import { CreateRecordForm } from './app/create/create-record-form'
import { fakeInvoiceClient } from './app/testing/fake-invoice-client'
import { createRowSource, invoiceCount, invoiceRowAt, invoicesColumns, invoicesNaturalSort, ordersColumns, ordersNaturalSort } from './data-grid'
import { ordersFilters } from './filter-panel'
import { orderAt, orderCount } from './mocks'
import { Button } from './primitives/button'
import { Input } from './primitives/input'
import { ListScreen } from './website/list-screen'

const viewports = {
  phone360: { name: 'Phone 360', styles: { width: '360px', height: '740px' }, type: 'mobile' },
  phone390: { name: 'Phone 390', styles: { width: '390px', height: '844px' }, type: 'mobile' },
  tablet768: { name: 'Tablet 768', styles: { width: '768px', height: '1024px' }, type: 'tablet' },
} as const

const meta = { title: 'Mobile', parameters: { layout: 'fullscreen', viewport: { options: viewports } } } satisfies Meta
export default meta
type Story = StoryObj

const storySession = createStaticSession('story-token', { id: 'story', email: 'story@example.test', name: 'Story User', role: 'user' })

const orders = createRowSource(orderCount, orderAt)
const invoices = createRowSource(invoiceCount, invoiceRowAt)

const ordersScreen = (
  <div className="h-screen">
    <ListScreen
      sidebarMode="text-small"
      activeItem="orders"
      breadcrumb={['Sales', 'Orders']}
      user={adminUser}
      title="Orders"
      subtitle="Every sales order across all warehouses."
      newLabel="New order"
      columns={ordersColumns}
      source={orders}
      naturalSort={ordersNaturalSort}
      filters={{ config: ordersFilters, layout: 'bar' }}
      showChart
    />
  </div>
)

export const OrdersPhone: Story = { globals: { viewport: { value: 'phone390' } }, render: () => ordersScreen }

export const OrdersTablet: Story = { globals: { viewport: { value: 'tablet768' } }, render: () => ordersScreen }

export const NavigationDrawer: Story = {
  globals: { viewport: { value: 'phone360' } },
  tags: ['play', 'phone'],
  render: () => (
    <div className="h-screen">
      <AppShell sidebarMode="icon" activeItem="orders" breadcrumb={['Sales', 'Orders']} user={adminUser}>
        <div className="p-4 text-muted-foreground">The sidebar lives in a drawer on phones, whatever the sidebar mode.</div>
      </AppShell>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const menu = canvas.getByRole('button', { name: 'Open navigation' })
    // The menu icon lines up with the page's 16px gutter.
    expect(menu.querySelector('svg')!.getBoundingClientRect().left).toBeCloseTo(16, 0)
    expect(menu).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(menu)
    const drawer = await canvas.findByRole('dialog', { name: 'Navigation' })
    expect(menu).toHaveAttribute('aria-expanded', 'true')
    expect(drawer).toContainElement(document.activeElement as HTMLElement)
    expect(document.body.style.overflow).toBe('hidden')
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(canvas.queryByRole('dialog', { name: 'Navigation' })).toBeNull())
    expect(document.body.style.overflow).toBe('')
    expect(menu).toHaveFocus()
  },
}

/** In the phone drawer, a direct message's row shows the other person's online dot and busy mark, named on the row. */
export const DirectMessagesDrawer: Story = {
  globals: { viewport: { value: 'phone360' } },
  tags: ['play', 'phone'],
  beforeEach: () => localStorage.removeItem(navOpenStorageKey('customers')),
  render: () => (
    <div className="h-screen">
      <AppShell sidebarMode="text-small" navGroups={withDirectMessages} activeItem="customers" breadcrumb={['Direct messages']} user={adminUser}>
        <div className="p-4 text-muted-foreground">Direct messages</div>
      </AppShell>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Open navigation' }))
    const drawer = await canvas.findByRole('dialog', { name: 'Navigation' })
    const ann = within(within(drawer).getByRole('list', { name: 'Recent direct messages' })).getByRole('link', { name: 'Ann, Online, Busy, Having lunch' })
    expect(within(ann).getByRole('img', { name: 'Online' })).toBeVisible()
    expect(within(ann).getByRole('img', { name: 'Busy' })).toBeVisible()
    // The marks sit inside the drawer, the count still at the row's end.
    expect(ann.getBoundingClientRect().right).toBeLessThanOrEqual(drawer.getBoundingClientRect().right)
    expect(ann).toHaveTextContent(/^Ann.*2$/)
  },
}

const warehouseTabs = [
  { id: 'stockLevels', label: 'Stock', icon: Boxes, href: '#stockLevels' },
  { id: 'stockMoves', label: 'Moves', icon: ArrowLeftRight, href: '#stockMoves' },
  { id: 'orders', label: 'Orders', icon: ShoppingCart, href: '#orders' },
  { id: 'help', label: 'Help', icon: LifeBuoy, href: 'https://docs.protobase.net', external: true },
] satisfies BottomBarTab[]

const TabbedShell = () => {
  const [active, setActive] = useState('stockLevels')
  return (
    <div className="h-screen">
      <AppShell
        sidebarMode="icon"
        activeItem={active}
        breadcrumb={[active]}
        user={adminUser}
        bottomBar={warehouseTabs.map((tab) => ({ ...tab, active: tab.id === active }))}
        onNavigate={(href) => setActive(href.slice(1))}
      >
        <div className="p-4 text-muted-foreground">A warehouse role gets tabs along the bottom; "More" opens the rest of the navigation.</div>
      </AppShell>
    </div>
  )
}

/** A bottom bar replaces the top bar's menu button on phones: four tabs and "More", which opens the drawer. */
export const BottomBarTabs: Story = {
  globals: { viewport: { value: 'phone390' } },
  tags: ['play', 'phone'],
  render: () => <TabbedShell />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const bar = canvas.getByRole('navigation', { name: 'Tabs' })
    expect(bar.getBoundingClientRect().bottom).toBeCloseTo(window.innerHeight, 0)
    expect(canvas.queryByRole('button', { name: 'Open navigation' })).toBeNull()
    const tabs = within(bar)
    expect(tabs.getAllByRole('link').map((link) => link.textContent)).toEqual(['Stock', 'Moves', 'Orders', 'Help'])
    expect(tabs.getByRole('link', { name: 'Stock' })).toHaveAttribute('aria-current', 'page')
    expect(tabs.getByRole('link', { name: 'Help' })).toHaveAttribute('target', '_blank')

    await userEvent.click(tabs.getByRole('link', { name: 'Moves' }))
    expect(tabs.getByRole('link', { name: 'Moves' })).toHaveAttribute('aria-current', 'page')
    expect(tabs.getByRole('link', { name: 'Stock' })).not.toHaveAttribute('aria-current')
    const more = tabs.getByRole('button', { name: 'More' })
    expect(more).not.toHaveAttribute('data-current')

    await userEvent.click(more)
    const drawer = await canvas.findByRole('dialog', { name: 'Navigation' })
    expect(more).toHaveAttribute('aria-expanded', 'true')
    await userEvent.click(within(drawer).getByRole('link', { name: 'Invoices' }))
    await waitFor(() => expect(canvas.queryByRole('dialog', { name: 'Navigation' })).toBeNull())
    expect(more).toHaveAttribute('data-current', 'true')
    expect(tabs.queryByRole('link', { current: 'page' })).toBeNull()
  },
}

const SearchableShell = ({ actions }: { actions?: ReactNode }) => {
  const [text, setText] = useState('')
  return (
    <div className="h-screen">
      <AppShell
        sidebarMode="icon"
        activeItem="orders"
        breadcrumb={['Sales', 'Orders']}
        user={adminUser}
        search={{ placeholder: 'Search orders and invoices', text, onTextChange: setText, query: '', loading: false, groups: [], onSelect: () => undefined }}
        actions={actions}
      >
        <div className="p-4 text-muted-foreground">On phones the search box sits behind a button in the top bar.</div>
      </AppShell>
    </div>
  )
}

export const SearchOnPhone: Story = {
  globals: { viewport: { value: 'phone360' } },
  tags: ['play', 'phone'],
  render: () => <SearchableShell />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Search' }))
    const field = await canvas.findByRole('combobox', { name: 'Global search' })
    expect(field).toHaveFocus()
    await userEvent.click(canvas.getByRole('button', { name: 'Close search' }))
    await waitFor(() => expect(canvas.queryByRole('combobox', { name: 'Global search' })).toBeNull())
  },
}

const topBarActions = (
  <>
    <Button size="sm">Export</Button>
    <Button size="sm">
      <StickyNote className="size-3.5" />
      Notes
    </Button>
    <AssistantButton open={false} onToggle={() => undefined} />
  </>
)

// Below `md` the Assistant button shows only its icon, still named "Assistant"; the project's actions keep their text.
const expectIconOnlyAssistant = (canvas: ReturnType<typeof within>, iconOnly: boolean) => {
  expect(canvas.getByRole('button', { name: 'Assistant' }).getBoundingClientRect().width === 36).toBe(iconOnly)
  for (const name of ['Export', 'Notes']) expect(canvas.getByRole('button', { name }).getBoundingClientRect().width).toBeGreaterThan(36)
}

export const TopBarActionsPhone: Story = {
  globals: { viewport: { value: 'phone390' } },
  tags: ['play', 'phone'],
  render: () => <SearchableShell actions={topBarActions} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(canvas.getByRole('button', { name: 'Search' })).toBeVisible()
    expectIconOnlyAssistant(canvas, true)
  },
}

export const TopBarActionsTablet: Story = { globals: { viewport: { value: 'tablet768' } }, render: () => <SearchableShell actions={topBarActions} /> }

/** The desktop top bar is unchanged: the search box and the Assistant button's text. */
export const TopBarActionsDesktop: Story = {
  tags: ['play'],
  render: () => <SearchableShell actions={topBarActions} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(canvas.getByRole('combobox', { name: 'Global search' })).toBeVisible()
    expectIconOnlyAssistant(canvas, false)
  },
}

const AssistantShell = () => {
  const [open, setOpen] = useState(true)
  return (
    <div className="h-screen">
      <AppShell
        sidebarMode="icon"
        activeItem="orders"
        breadcrumb={['Sales', 'Orders']}
        user={adminUser}
        actions={<AssistantButton open={open} onToggle={() => setOpen(!open)} />}
        rightPanel={open && <AssistantDock state={conversation} onClose={() => setOpen(false)} />}
      >
        <div className="p-4 text-muted-foreground">The page under the assistant.</div>
      </AppShell>
    </div>
  )
}

/** On phones the open assistant covers the whole screen, its close button and composer in view. */
export const AssistantPhone: Story = {
  globals: { viewport: { value: 'phone390' } },
  tags: ['play', 'phone'],
  render: () => <AssistantShell />,
  play: async ({ canvasElement }) => {
    const panel = within(canvasElement).getByRole('complementary', { name: 'Assistant' })
    const box = panel.getBoundingClientRect()
    expect([box.left, box.top, box.width, box.height].map(Math.round)).toEqual([0, 0, window.innerWidth, window.innerHeight])
    expect(within(panel).getByRole('button', { name: 'Close' })).toBeVisible()
    expect(within(panel).getByRole('textbox', { name: 'Message' }).getBoundingClientRect().bottom).toBeLessThanOrEqual(window.innerHeight)
  },
}

/** Closing the assistant on a phone shows the page again. */
export const AssistantPhoneClose: Story = {
  globals: { viewport: { value: 'phone390' } },
  tags: ['play', 'phone'],
  render: () => <AssistantShell />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(within(canvas.getByRole('complementary', { name: 'Assistant' })).getByRole('button', { name: 'Close' }))
    expect(canvas.queryByRole('complementary', { name: 'Assistant' })).toBeNull()
    expect(canvas.getByText('The page under the assistant.')).toBeVisible()
  },
}

export const AssistantTablet: Story = { globals: { viewport: { value: 'tablet768' } }, render: () => <AssistantShell /> }

/** From `md` up the assistant stays a panel beside the page. */
export const AssistantDesktop: Story = {
  tags: ['play'],
  render: () => <AssistantShell />,
  play: async ({ canvasElement }) => {
    const box = within(canvasElement).getByRole('complementary', { name: 'Assistant' }).getBoundingClientRect()
    expect(box.width).toBe(380)
    expect(box.right).toBe(window.innerWidth)
  },
}

export const InvoicesPhone: Story = {
  globals: { viewport: { value: 'phone360' } },
  render: () => (
    <div className="h-screen">
      <ListScreen sidebarMode="text-small" activeItem="invoices" breadcrumb={['Sales', 'Invoices']} user={adminUser} title="Invoices" subtitle="Scroll sideways; pin a column from its header menu." newLabel="New invoice" columns={invoicesColumns(true)} source={invoices} naturalSort={invoicesNaturalSort} />
    </div>
  ),
}

export const InvoiceRecordPhone: Story = {
  globals: { viewport: { value: 'phone360' } },
  render: () => (
    <div className="h-screen">
      <App client={fakeInvoiceClient().client} auth={storySession} initialUrl="/invoices/i1" />
    </div>
  ),
}

export const ConflictDialogPhone: Story = {
  globals: { viewport: { value: 'phone360' } },
  render: () => (
    <div className="h-screen bg-surface">
      <ConflictDialog
        title="SO-2026-139874"
        changes={[
          { field: 'status', label: 'Status', before: 'Draft', after: 'Confirmed' },
          { field: 'notes', label: 'Notes', before: '—', after: 'Call the customer first' },
        ]}
        onCancel={() => undefined}
        onReview={() => undefined}
        onDeleteAnyway={() => undefined}
      />
    </div>
  ),
}

export const CreateFormPhone: Story = {
  globals: { viewport: { value: 'phone360' } },
  render: () => (
    <div className="h-screen">
      <CreateRecordForm
        noun="Order"
        collection="Orders"
        saving={false}
        onSubmit={() => undefined}
        onCancel={() => undefined}
        sections={[
          {
            title: 'Details',
            help: 'Fields marked * are required.',
            fields: [
              { name: 'number', label: 'Number', required: true, editor: <Input placeholder="SO-2026-140001" /> },
              { name: 'company', label: 'Company', required: true, editor: <Input placeholder="Search companies" /> },
              { name: 'notes', label: 'Notes', editor: <Input /> },
            ],
          },
        ]}
      />
    </div>
  ),
}
