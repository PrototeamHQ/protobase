import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import type { ViewModel } from '@protobase/schema'
import { ExportDialog, ExportProgressDialog } from './export-dialog'

const fields = [
  { name: 'number', label: 'Number' },
  { name: 'customer_id', label: 'Customer' },
  { name: 'status', label: 'Status' },
  { name: 'total', label: 'Total' },
  { name: 'created_at', label: 'Created' },
]

const view = { resource: 'orders', fields: {}, filters: [], layout: [], actions: [] } as ViewModel

const meta = {
  title: 'Export/Dialog',
  component: ExportDialog,
  tags: ['play'],
  parameters: { layout: 'fullscreen' },
  args: { plural: 'Orders', view, fields, initialColumns: ['number', 'status', 'total'], count: { kind: 'exact', rows: 1234 }, open: true, onExport: fn(), onClose: fn() },
} satisfies Meta<typeof ExportDialog>

export default meta
type Story = StoryObj<typeof meta>

const dialog = (canvasElement: HTMLElement) => within(document.body).findByRole('dialog', { name: 'Export orders' })

/** The list's columns are chosen, in its order; the others can be added and every column moved. */
export const ChooseColumns: Story = {
  play: async ({ canvasElement, args }) => {
    const box = within(await dialog(canvasElement))
    expect(box.getByRole('status')).toHaveTextContent('Exports 1,234 rows.')
    const columns = () => within(box.getByRole('list', { name: 'Columns' })).getAllByRole('listitem').map((item) => item.textContent)
    expect(columns()).toEqual(['Number', 'Status', 'Total', 'Customer', 'Created'])
    expect(box.getByRole('checkbox', { name: 'Customer' })).toHaveAttribute('aria-checked', 'false')

    await userEvent.click(box.getByRole('checkbox', { name: 'Created' }))
    await userEvent.click(box.getByRole('button', { name: 'Move Created up' }))
    await userEvent.click(box.getByRole('checkbox', { name: 'Status' }))
    expect(columns()).toEqual(['Number', 'Created', 'Total', 'Customer', 'Status'])
    expect(box.getByRole('button', { name: 'Move Number up' })).toBeDisabled()

    await userEvent.click(box.getByRole('button', { name: 'CSV' }))
    await userEvent.click(box.getByRole('button', { name: 'Raw values' }))
    expect(box.getByText('Values as they are stored, such as keys and codes.')).toBeVisible()
    await userEvent.click(box.getByRole('button', { name: 'Export' }))
    expect(args.onExport).toHaveBeenCalledWith({ format: 'csv', scope: 'list', columns: ['number', 'created_at', 'total'], mode: 'raw' })
  },
}

/** With rows selected the file holds them by default; the list's rows are one press away. */
export const SelectedRows: Story = {
  args: { selected: 3 },
  play: async ({ canvasElement, args }) => {
    const box = within(await dialog(canvasElement))
    expect(box.getByRole('button', { name: 'Selected (3)' })).toHaveAttribute('aria-pressed', 'true')
    expect(box.getByRole('status')).toHaveTextContent('Exports 3 selected rows.')
    await userEvent.click(box.getByRole('button', { name: 'Rows in the list' }))
    expect(box.getByRole('status')).toHaveTextContent('Exports 1,234 rows.')
    expect(box.getByText('With the list’s filters, search and sort.')).toBeVisible()
    await userEvent.click(box.getByRole('button', { name: 'Export' }))
    expect(args.onExport).toHaveBeenCalledWith({ format: 'xlsx', scope: 'list', columns: ['number', 'status', 'total'], mode: 'shown' })
  },
}

/** A view's limit, and a count past what is counted exactly, both say how many rows the file leaves out. */
export const OverTheViewsLimit: Story = {
  args: { view: { ...view, export: { maxRows: 10_000 } }, count: { kind: 'estimate', rows: 182_400 } },
  play: async ({ canvasElement }) => {
    const box = within(await dialog(canvasElement))
    expect(box.getByRole('status')).toHaveTextContent('Exports about 182,400 rows. A file holds at most 10,000 rows; the rest are left out.')
  },
}

/** No columns, no file. */
export const NoColumns: Story = {
  args: { initialColumns: ['number'] },
  play: async ({ canvasElement, args }) => {
    const box = within(await dialog(canvasElement))
    await userEvent.click(box.getByRole('checkbox', { name: 'Number' }))
    expect(box.getByRole('button', { name: 'Export' })).toBeDisabled()
    await userEvent.click(box.getByRole('button', { name: 'Cancel' }))
    expect(args.onClose).toHaveBeenCalled()
  },
}

export const Progress: StoryObj<typeof ExportProgressDialog> = {
  render: (args) => <ExportProgressDialog {...args} />,
  args: { plural: 'Orders', done: 1500, total: 6000, onCancel: fn() },
  play: async ({ canvasElement, args }) => {
    const box = within(await within(document.body).findByRole('dialog', { name: 'Exporting orders' }))
    expect(box.getByRole('progressbar', { name: 'Rows exported' })).toHaveAttribute('aria-valuenow', '1500')
    expect(box.getByText('1,500 of 6,000 rows')).toBeVisible()
    await userEvent.click(box.getByRole('button', { name: 'Cancel' }))
    expect(args.onCancel).toHaveBeenCalled()
  },
}
