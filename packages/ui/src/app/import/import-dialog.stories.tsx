import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { ApiError, type BatchOp, type Client } from '@protobase/client'
import { parseFilter, type ResourceModel, type ViewModel } from '@protobase/schema'
import { ApiProvider } from '../../data/api-provider'
import { buildWorkbook } from '../testing/xlsx-fixture'
import { ImportDialog } from './import-dialog'

const field = (name: string, type: string, extra = {}) => ({ name, column: name, type, nullable: false, readOnly: false, filterable: false, sortable: false, aliases: [], ...extra })

const customers = {
  name: 'customers',
  table: { name: 'customers' },
  primaryKey: ['id'],
  fields: { id: field('id', 'integer', { readOnly: true, filterable: true }), name: field('name', 'text', { filterable: true }), email: field('email', 'text', { filterable: true }) },
} as unknown as ResourceModel

const orders = {
  name: 'orders',
  table: { name: 'orders' },
  primaryKey: ['id'],
  fields: {
    id: field('id', 'integer', { readOnly: true, filterable: true }),
    number: field('number', 'text', { filterable: true }),
    customer: field('customer', 'relation', { relation: { resource: 'customers', columns: ['customer_id'] } }),
    status: field('status', 'enum', { enumValues: ['draft', 'confirmed'], default: { value: 'draft' } }),
    total: field('total', 'decimal', { nullable: true }),
    ordered_on: field('ordered_on', 'date', { nullable: true }),
  },
} as unknown as ResourceModel

const views = {
  orders: {
    resource: 'orders',
    names: { singular: 'Order', plural: 'Orders' },
    fields: { number: { label: 'Order number' }, ordered_on: { label: 'Ordered on' }, status: { valueLabels: { draft: 'Draft', confirmed: 'Confirmed' } } },
    filters: [],
    layout: [],
    actions: [],
  },
  customers: { resource: 'customers', names: { singular: 'Customer', plural: 'Customers' }, fields: { email: { label: 'Email' } }, filters: [], layout: [], actions: [] },
} as unknown as Record<string, ViewModel>

const resources = { orders, customers }

const stored: Record<string, Record<string, unknown>[]> = {
  customers: [
    { id: 1, name: 'Acme', email: 'buyer@acme.test' },
    { id: 2, name: 'Globex', email: 'office@globex.test' },
  ],
  orders: [{ id: 7, number: 'SO-1001' }],
}

type Args = { batchWrite: (ops: BatchOp[]) => Promise<{ results: Array<{ op: string }> }>; onClose: () => void; canUpdate: boolean }

// The API: lists answer `in(field, ...)` filters from the stored records; a batch writes everything, unless a row's
// order number is "SO-TAKEN", which the server refuses as a duplicate
const fakeClient = (batchWrite: Args['batchWrite']) =>
  ({
    list: async (resource: string, { filter }: { filter: string }) => {
      const { ast } = parseFilter(filter)
      if (ast?.kind !== 'in') throw new Error(`The story's API reads in() filters only: ${filter}`)
      const values = ast.values.map((value) => ('value' in value ? String(value.value) : ''))
      return { items: (stored[resource] ?? []).filter((record) => values.includes(String(record[ast.field.path[0]!]))), nextPageToken: '' }
    },
    batchWrite: async (ops: BatchOp[]) => {
      const taken = ops.findIndex((op) => op.op !== 'delete' && op.op !== 'reorder' && op.data.number === 'SO-TAKEN')
      if (taken >= 0) throw new ApiError({ type: 'urn:protobase:problem:conflict', title: 'Conflict', status: 409, operation: taken, errors: [{ field: 'number', message: 'is already used by another order', operation: taken }] } as never)
      return batchWrite(ops)
    },
  }) as unknown as Client

const meta = {
  title: 'Import/Dialog',
  tags: ['play'],
  parameters: { layout: 'fullscreen' },
  args: { batchWrite: fn(async (ops: BatchOp[]) => ({ results: ops.map((op) => ({ op: op.op })) })), onClose: fn(), canUpdate: true },
  render: ({ batchWrite, onClose, canUpdate }) => (
    <ApiProvider client={fakeClient(batchWrite)}>
      <ImportDialog model={orders} resources={resources} views={views} canUpdate={canUpdate} onClose={onClose} />
    </ApiProvider>
  ),
} satisfies Meta<Args>

export default meta
type Story = StoryObj<typeof meta>

const csv = [
  'Order number;Customer;Status;Total;Ordered on',
  'SO-2001;buyer@acme.test;Confirmed;1.250,50;03-04-2026',
  'SO-2002;office@globex.test;draft;;',
  'SO-2003;nobody@example.test;Shipped;abc;31-02-2026',
  'SO-TAKEN;buyer@acme.test;Draft;10;',
].join('\n')

const dialogOf = (canvasElement: HTMLElement) => within(canvasElement.ownerDocument.body).findByRole('dialog', { name: 'Import orders' })

/** A CSV with European numbers and dates: columns map by header, the customer is found by email, and the rows are checked before anything is written. */
export const FromCsv: Story = {
  play: async ({ canvasElement, args }) => {
    const dialog = within(await dialogOf(canvasElement))
    await userEvent.upload(dialog.getByLabelText('File'), new File([csv], 'orders.csv', { type: 'text/csv' }))

    const customer = await dialog.findByLabelText('Field for Customer', undefined, { timeout: 5000 })
    await expect(dialog.getByLabelText('Field for Order number')).toHaveValue('number')
    await expect(customer).toHaveValue('customer')
    await userEvent.selectOptions(dialog.getByLabelText('Customers found by'), 'email')
    await userEvent.selectOptions(dialog.getByLabelText('Numbers'), ',')
    await userEvent.selectOptions(dialog.getByLabelText('Dates'), 'dmy')
    await userEvent.click(dialog.getByRole('button', { name: 'Check rows' }))

    await expect(await dialog.findByLabelText('Check', undefined, { timeout: 5000 })).toHaveTextContent('Rows4To create3To update0With problems1')
    const problems = dialog.getByRole('list', { name: 'Rows not imported' })
    await expect(problems).toHaveTextContent('Row 4: Status: “Shipped” is not one of Draft, Confirmed; Total: “abc” is not a number; Ordered on: “31-02-2026” is not a date (2026-04-03 or day/month/year); Customer: no customer has email “nobody@example.test”')
    const preview = dialog.getByRole('table', { name: 'First rows' })
    await expect(preview).toHaveTextContent('Confirmed')
    await expect(args.batchWrite).not.toHaveBeenCalled()

    await userEvent.click(dialog.getByRole('button', { name: 'Import 3 rows' }))
    await waitFor(() => expect(dialog.getByLabelText('Import summary')).toHaveTextContent('Created2Updated0Skipped1Failed1'), { timeout: 5000 })
    await expect(dialog.getByRole('list', { name: 'Rows not imported' })).toHaveTextContent('Row 5: Order number: is already used by another order')
    await expect(args.batchWrite).toHaveBeenCalledTimes(1)
    await expect((args.batchWrite as ReturnType<typeof fn>).mock.calls[0]![0]).toEqual([
      { op: 'create', resource: 'orders', data: { number: 'SO-2001', customer: 1, status: 'confirmed', total: '1250.50', ordered_on: '2026-04-03' } },
      { op: 'create', resource: 'orders', data: { number: 'SO-2002', customer: 2, status: 'draft', total: null, ordered_on: null } },
    ])
  },
}

/** A workbook of several sheets asks which one to read; a column the user skips leaves a required field unfilled, which blocks the check. */
export const FromWorkbook: Story = {
  play: async ({ canvasElement }) => {
    const workbook = await buildWorkbook({
      Notes: [['Text'], ['Not this one']],
      Orders: [
        ['Order number', 'Customer', 'Ordered on'],
        ['SO-3001', 1, { serial: 46082 }],
      ],
    })
    const dialog = within(await dialogOf(canvasElement))
    await userEvent.upload(dialog.getByLabelText('File'), new File([workbook], 'orders.xlsx'))
    await userEvent.selectOptions(await dialog.findByLabelText('Sheet', undefined, { timeout: 5000 }), 'Orders')
    await userEvent.click(dialog.getByRole('button', { name: 'Next' }))

    await expect(await dialog.findByLabelText('Field for Ordered on', undefined, { timeout: 5000 })).toHaveValue('ordered_on')
    await expect(dialog.getByText('2026-03-01')).toBeVisible()
    await userEvent.selectOptions(dialog.getByLabelText('Field for Customer'), '')
    await expect(dialog.getByRole('alert')).toHaveTextContent('No column fills Customer, which new records need.')
    await expect(dialog.getByRole('button', { name: 'Check rows' })).toBeDisabled()
  },
}

/** Update mode finds each order by its number; a row whose number finds no order is not imported. */
export const UpdateByNumber: Story = {
  play: async ({ canvasElement, args }) => {
    const dialog = within(await dialogOf(canvasElement))
    await userEvent.upload(dialog.getByLabelText('File'), new File(['Order number,Total\nSO-1001,99.5\nSO-9999,1\n'], 'totals.csv'))
    await userEvent.click(await dialog.findByRole('button', { name: 'Update' }, { timeout: 5000 }))
    await userEvent.selectOptions(dialog.getByLabelText('Find records by'), 'number')
    await userEvent.selectOptions(dialog.getByLabelText('Found in column'), '0')
    await userEvent.selectOptions(dialog.getByLabelText('Numbers'), '.')
    await userEvent.click(dialog.getByRole('button', { name: 'Check rows' }))

    await expect(await dialog.findByLabelText('Check', undefined, { timeout: 5000 })).toHaveTextContent('Rows2To create0To update1With problems1')
    await expect(dialog.getByRole('list', { name: 'Rows not imported' })).toHaveTextContent('Row 3: Nothing to update: no order has order number “SO-9999”')
    await userEvent.click(dialog.getByRole('button', { name: 'Import 1 row' }))
    await waitFor(() => expect(dialog.getByLabelText('Import summary')).toHaveTextContent('Created0Updated1Skipped1Failed0'), { timeout: 5000 })
    await expect((args.batchWrite as ReturnType<typeof fn>).mock.calls[0]![0]).toEqual([{ op: 'update', resource: 'orders', key: 7, etag: '*', data: { number: 'SO-1001', total: '99.5' } }])
  },
}

/** A user who may not update records only creates them. */
export const CreateOnly: Story = {
  args: { canUpdate: false },
  play: async ({ canvasElement }) => {
    const dialog = within(await dialogOf(canvasElement))
    await userEvent.upload(dialog.getByLabelText('File'), new File(['Order number,Customer\nSO-1,1\n'], 'orders.csv'))
    await dialog.findByLabelText('Field for Customer', undefined, { timeout: 5000 })
    await expect(dialog.queryByRole('button', { name: 'Update' })).toBeNull()
  },
}
