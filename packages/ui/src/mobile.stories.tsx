import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { AppShell } from './app-shell'
import { adminUser } from './website/users'
import { ConflictDialog } from './app/delete/dialogs'
import { CreateRecordForm } from './app/create/create-record-form'
import { createRowSource, invoiceCount, invoiceRowAt, invoicesColumns, invoicesNaturalSort, ordersColumns, ordersNaturalSort } from './data-grid'
import { ordersFilters } from './filter-panel'
import { orderAt, orderCount } from './mocks'
import { Input } from './primitives/input'
import { InvoiceRecordView } from './record-view'
import { ListScreen } from './website/list-screen'

const viewports = {
  phone360: { name: 'Phone 360', styles: { width: '360px', height: '740px' }, type: 'mobile' },
  phone390: { name: 'Phone 390', styles: { width: '390px', height: '844px' }, type: 'mobile' },
  tablet768: { name: 'Tablet 768', styles: { width: '768px', height: '1024px' }, type: 'tablet' },
} as const

const meta = { title: 'Mobile', parameters: { layout: 'fullscreen', viewport: { options: viewports } } } satisfies Meta
export default meta
type Story = StoryObj

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

const SearchableShell = () => {
  const [text, setText] = useState('')
  return (
    <div className="h-screen">
      <AppShell
        sidebarMode="icon"
        activeItem="orders"
        breadcrumb={['Sales', 'Orders']}
        user={adminUser}
        search={{ placeholder: 'Search orders and invoices', text, onTextChange: setText, query: '', loading: false, groups: [], onSelect: () => undefined }}
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
      <AppShell sidebarMode="text-small" activeItem="invoices" breadcrumb={['Sales', 'Invoices', 'INV-2026-04218']} user={adminUser}>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <InvoiceRecordView saveFeedback="toast" ticking={false} />
        </div>
      </AppShell>
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
