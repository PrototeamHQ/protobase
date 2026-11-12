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
import { fakeUserTables } from './app/testing/fake-user-tables'
import { createRowSource } from './data-grid'
import { invoiceCount, invoiceRowAt, invoicesColumns, invoicesNaturalSort } from './data-grid/invoices-fixtures'
import { ordersColumns, ordersNaturalSort } from './data-grid/orders-fixtures'
import { ordersFilters } from './filter-panel'
import { orderAt, orderCount } from './mocks'
import { Button } from './primitives/button'
import { Input } from './primitives/input'
import { ListScreen } from './website/list-screen'
import { sampleNavGroups } from './app-shell/nav-fixtures'

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
      <AppShell navGroups={sampleNavGroups} sidebarMode="icon" activeItem="orders" breadcrumb={['Sales', 'Orders']} user={adminUser}>
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
    // The sidebar fills the drawer, not the third of the window a desktop sidebar keeps to.
    expect(within(drawer).getByRole('navigation', { name: 'Resources' }).getBoundingClientRect().width).toBe(drawer.clientWidth)
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
        navGroups={sampleNavGroups}
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
        navGroups={sampleNavGroups}
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
        navGroups={sampleNavGroups}
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

// The tables users add, made from the admin app on a phone: the page scrolls, never sideways.
const fitsWidth = async () => waitFor(() => expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth))

const tablesApp = (initialUrl: string, made = true) => (
  <div className="h-screen">
    <App client={fakeUserTables({ made }).client} auth={storySession} initialUrl={initialUrl} />
  </div>
)

export const TablesPhone: Story = {
  globals: { viewport: { value: 'phone360' } },
  tags: ['play', 'phone'],
  render: () => tablesApp('/user_tables'),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(await canvas.findByRole('heading', { name: 'Tables' })).toBeInTheDocument()
    expect(await canvas.findByText('notes')).toBeInTheDocument()
    await fitsWidth()
  },
}

export const NewTablePhone: Story = {
  globals: { viewport: { value: 'phone360' } },
  tags: ['play', 'phone'],
  render: () => tablesApp('/user_tables/new'),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(await canvas.findByLabelText(/Plural label/)).toBeInTheDocument()
    // The title names a field, and a new table has none yet
    expect(canvas.queryByLabelText(/Title field/)).toBeNull()
    await fitsWidth()
  },
}

export const NewFieldPhone: Story = {
  globals: { viewport: { value: 'phone360' } },
  tags: ['play', 'phone'],
  render: () => tablesApp('/user_table_fields/new?table_id=1'),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByRole('combobox', { name: /Type/ }))
    const options = await canvas.findAllByRole('option')
    expect(options.map((option) => option.textContent)).toEqual(expect.arrayContaining(['Text', 'Long text', 'Whole number', 'Decimal number', 'Yes or no', 'Date and time']))
    expect(options.map((option) => option.textContent)).not.toContain('long_text')
    expect(canvas.queryByLabelText(/Required/)).toBeNull()
  },
}

export const TableRecordPhone: Story = {
  globals: { viewport: { value: 'phone360' } },
  tags: ['play', 'phone'],
  render: () => tablesApp('/user_tables/1'),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(await canvas.findByRole('heading', { name: 'Fields' })).toBeInTheDocument()
    expect(await canvas.findByText('Body')).toBeInTheDocument()
    await userEvent.click(canvas.getByRole('button', { name: 'Record actions' }))
    expect(await within(document.body).findByRole('menuitem', { name: 'Open table' })).toHaveAttribute('href', '/notes')
    expect(within(document.body).getByRole('menuitem', { name: 'Add field' })).toHaveAttribute('href', '/user_table_fields/new?table_id=1')
    await fitsWidth()
  },
}

export const MakeTablePhone: Story = {
  globals: { viewport: { value: 'phone360' } },
  tags: ['play', 'phone'],
  render: () => tablesApp('/user_tables/new', false),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.type(await canvas.findByLabelText(/Plural label/), 'Notes')
    await userEvent.type(canvas.getByLabelText(/Singular label/), 'Note')
    await userEvent.type(canvas.getByLabelText(/^Name/), 'notes')
    await userEvent.click(canvas.getByRole('button', { name: 'Create table' }))
    expect(await canvas.findByRole('heading', { name: 'Fields' })).toBeInTheDocument()
    // The server serves the new table at once; the app reads `/meta` again and links to it
    window.dispatchEvent(new Event('focus'))
    await userEvent.click(await canvas.findByRole('button', { name: 'Record actions' }))
    expect(await within(document.body).findByRole('menuitem', { name: 'Open table' })).toHaveAttribute('href', '/notes')
    await userEvent.keyboard('{Escape}')
    await userEvent.click(canvas.getByRole('button', { name: 'Open navigation' }))
    const drawer = within(await canvas.findByRole('dialog', { name: 'Navigation' }))
    expect(drawer.getByRole('link', { name: 'Tables' })).toHaveAttribute('href', '/user_tables')
    expect(await drawer.findByRole('link', { name: 'Notes' })).toHaveAttribute('href', '/notes')
  },
}

// Import on a phone: the dialog is a sheet whose steps stack in one column, never wider than the screen.
const dialogNamed = async (name: string) => within(await within(document.body).findByRole('dialog', { name }))
const notesCsv = (rows: string[]) => new File([['Title,Body', ...rows].join('\n')], 'notes.csv', { type: 'text/csv' })

const openImport = async (canvasElement: HTMLElement) => {
  await userEvent.click(await within(canvasElement).findByRole('button', { name: 'Import' }))
  return dialogNamed('Import notes')
}

export const ImportFilePhone: Story = {
  globals: { viewport: { value: 'phone360' } },
  tags: ['play', 'phone'],
  render: () => tablesApp('/notes'),
  play: async ({ canvasElement }) => {
    const dialog = await openImport(canvasElement)
    expect(dialog.getByLabelText('File')).toBeInTheDocument()
    await fitsWidth()
  },
}

export const ImportMappingPhone: Story = {
  globals: { viewport: { value: 'phone360' } },
  tags: ['play', 'phone'],
  render: () => tablesApp('/notes'),
  play: async ({ canvasElement }) => {
    const dialog = await openImport(canvasElement)
    await userEvent.upload(dialog.getByLabelText('File'), notesCsv(['Shopping,Milk and bread']))
    expect(await dialog.findByLabelText('Field for Title', undefined, { timeout: 5000 })).toHaveValue('title')
    await fitsWidth()
  },
}

export const ImportResultPhone: Story = {
  globals: { viewport: { value: 'phone360' } },
  tags: ['play', 'phone'],
  render: () => tablesApp('/notes'),
  play: async ({ canvasElement }) => {
    const dialog = await openImport(canvasElement)
    await userEvent.upload(dialog.getByLabelText('File'), notesCsv(['Shopping,Milk and bread', ',No title']))
    await userEvent.click(await dialog.findByRole('button', { name: 'Check rows' }, { timeout: 5000 }))
    await userEvent.click(await dialog.findByRole('button', { name: 'Import 1 row' }, { timeout: 5000 }))
    await waitFor(() => expect(dialog.getByLabelText('Import summary')).toHaveTextContent('Created1Updated0Skipped1Failed0'), { timeout: 5000 })
    await fitsWidth()
  },
}

// A new table from a file on a phone: the fields step proposes a field per column, typed from its cells
const openTableFromFile = async (canvasElement: HTMLElement) => {
  await userEvent.click(await within(canvasElement).findByRole('button', { name: 'From a file' }))
  return dialogNamed('New table from a file')
}

export const TableFromFilePhone: Story = {
  globals: { viewport: { value: 'phone360' } },
  tags: ['play', 'phone'],
  render: () => tablesApp('/user_tables', false),
  play: async ({ canvasElement }) => {
    const dialog = await openTableFromFile(canvasElement)
    expect(dialog.getByLabelText('File')).toBeInTheDocument()
    await fitsWidth()
  },
}

export const TableFieldsPhone: Story = {
  globals: { viewport: { value: 'phone360' } },
  tags: ['play', 'phone'],
  render: () => tablesApp('/user_tables', false),
  play: async ({ canvasElement }) => {
    const dialog = await openTableFromFile(canvasElement)
    await userEvent.upload(dialog.getByLabelText('File'), notesCsv(['Shopping,007', 'Garden,1,5']))
    expect(await dialog.findByLabelText('Type for Title', undefined, { timeout: 5000 })).toHaveValue('text')
    // 007 and 1,5 could be read two ways, so the column stays text
    expect(dialog.getByLabelText('Type for Body')).toHaveValue('text')
    expect(dialog.getByLabelText('Name for Title')).toHaveValue('title')
    expect(dialog.getByRole('button', { name: 'Make table with 2 rows' })).toBeDisabled()
    await fitsWidth()
  },
}

export const TableFromFileMadePhone: Story = {
  globals: { viewport: { value: 'phone360' } },
  tags: ['play', 'phone'],
  render: () => tablesApp('/user_tables', false),
  play: async ({ canvasElement }) => {
    const dialog = await openTableFromFile(canvasElement)
    await userEvent.upload(dialog.getByLabelText('File'), notesCsv(['Shopping,Milk and bread', 'Garden,Water the plants']))
    await userEvent.type(await dialog.findByLabelText(/Singular label/, undefined, { timeout: 5000 }), 'Note')
    await userEvent.click(dialog.getByRole('button', { name: 'Make table with 2 rows' }))
    // Every row written: the new table's list, with its records
    const canvas = within(canvasElement)
    expect(await canvas.findByRole('heading', { name: 'Notes' }, { timeout: 5000 })).toBeInTheDocument()
    expect(await canvas.findByText('Garden')).toBeInTheDocument()
    await fitsWidth()
  },
}
