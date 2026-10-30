import type { Meta, StoryObj } from '@storybook/react-vite'
import { strFromU8, unzipSync } from 'fflate'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import type { Client, ListParams } from '@protobase/client'
import type { ResourceModel, ViewModel } from '@protobase/schema'
import { ApiProvider } from '../../data/api-provider'
import { Button } from '../../primitives/button'
import { ToastProvider } from '../../toasts'
import type { ExportSink } from './sink'
import { useExportFlow } from './use-export-flow'

const field = (name: string, type: string, extra = {}) => ({ name, column: name, type, nullable: true, readOnly: false, filterable: true, sortable: true, aliases: [], ...extra })

const orders = {
  name: 'orders',
  table: { schema: 'sales', name: 'orders' },
  primaryKey: ['id'],
  fields: {
    id: field('id', 'integer', { readOnly: true }),
    number: field('number', 'text'),
    customer_id: field('customer_id', 'relation', { relation: { resource: 'customers', columns: ['customer_id'] } }),
    status: field('status', 'enum', { enumValues: ['draft', 'shipped'] }),
    total: field('total', 'decimal'),
    iban: field('iban', 'text', { sensitive: true }),
  },
} as unknown as ResourceModel

const customers = { name: 'customers', primaryKey: ['id'], fields: { id: field('id', 'integer'), name: field('name', 'text') } } as unknown as ResourceModel

const view = {
  resource: 'orders',
  names: { singular: 'Order', plural: 'Orders' },
  list: { columns: ['number', 'customer_id', 'status', 'total'] },
  fields: { number: { format: 'code' }, customer_id: { label: 'Customer' }, status: { valueLabels: { draft: 'Draft', shipped: 'Shipped' }, valueColors: { shipped: 'violet' } }, total: { prefix: '€', currency: 'EUR', decimals: 2 } },
  filters: [],
  layout: [],
  actions: [],
} as unknown as ViewModel

const customersView = { resource: 'customers', title: 'name', fields: {}, filters: [], layout: [], actions: [] } as unknown as ViewModel

const total = 1200
const record = (index: number) => ({ id: index + 1, number: `SO-${index + 1}`, customer_id: (index % 3) + 1, status: index % 2 ? 'shipped' : 'draft', total: `${index}.50` })

type HarnessArgs = { search: (params: ListParams) => void; write: (bytes: Uint8Array) => void; abort: () => void; delayMs: number }

// The list API in pages of `pageSize`, the page token being the next row's position.
const fakeClient = ({ search, delayMs }: Pick<HarnessArgs, 'search' | 'delayMs'>) =>
  ({
    list: async () => ({ items: [record(0)], nextPageToken: '1', totalSizeEstimate: total, totalSize: total }),
    search: async (_resource: string, params: ListParams) => {
      search(params)
      await new Promise((resolve) => setTimeout(resolve, delayMs))
      const start = Number(params.pageToken || 0)
      const end = Math.min(total, start + params.pageSize!)
      const items = Array.from({ length: end - start }, (_, offset) => record(start + offset))
      return { items, nextPageToken: end < total ? String(end) : '', totalSizeEstimate: total, labels: { customer_id: { '1': 'Acme', '2': 'Globex', '3': 'Initech' } } }
    },
  }) as unknown as Client

const Harness = ({ write, abort }: Pick<HarnessArgs, 'write' | 'abort'>) => {
  const createSink = async (): Promise<ExportSink> => ({ write: async (bytes) => write(bytes), close: async () => undefined, abort: async () => abort() })
  const flow = useExportFlow({ model: orders, view, resources: { orders, customers }, views: { orders: view, customers: customersView }, plural: 'Orders', filter: 'status = "shipped"', orderBy: 'number', createSink })
  return (
    <div className="p-6">
      <Button onClick={() => flow.open()}>Export</Button>
      {flow.dialogs}
    </div>
  )
}

const meta = {
  title: 'Export/Flow',
  tags: ['play'],
  parameters: { layout: 'fullscreen' },
  args: { search: fn(), write: fn(), abort: fn(), delayMs: 0 },
  render: ({ search, write, abort, delayMs }) => (
    <ApiProvider client={fakeClient({ search, delayMs })}>
      <ToastProvider>
        <Harness write={write} abort={abort} />
      </ToastProvider>
    </ApiProvider>
  ),
} satisfies Meta<HarnessArgs>

export default meta
type Story = StoryObj<typeof meta>

const startExport = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement)
  await userEvent.click(canvas.getByRole('button', { name: 'Export' }))
  const dialog = within(await within(document.body).findByRole('dialog', { name: 'Export orders' }))
  await waitFor(() => expect(dialog.getByRole('status')).toHaveTextContent('Exports 1,200 rows.'))
  // A sensitive field is never offered
  expect(dialog.queryByRole('checkbox', { name: 'Iban' })).toBeNull()
  await userEvent.click(dialog.getByRole('button', { name: 'Export' }))
}

const fileOf = (write: HarnessArgs['write']) => {
  const chunks = (write as ReturnType<typeof fn>).mock.calls.map(([bytes]) => bytes as Uint8Array)
  const bytes = new Uint8Array(chunks.reduce((size, chunk) => size + chunk.length, 0))
  chunks.reduce((offset, chunk) => (bytes.set(chunk, offset), offset + chunk.length), 0)
  return bytes
}

/** The rows come page by page through the list API, and a worker builds the workbook from them. */
export const ExportsAWorkbook: Story = {
  play: async ({ canvasElement, args }) => {
    await startExport(canvasElement)
    expect(await within(canvasElement).findByText('Exported 1,200 orders', {}, { timeout: 10_000 })).toBeInTheDocument()
    expect(args.search).toHaveBeenCalledTimes(3)
    expect(args.search).toHaveBeenCalledWith(expect.objectContaining({ filter: 'status = "shipped"', orderBy: 'number', pageSize: 500, fields: ['number', 'customer_id', 'status', 'total'], labels: { customer_id: 'name' } }))
    const sheet = strFromU8(unzipSync(fileOf(args.write))['xl/worksheets/sheet1.xml']!)
    expect(sheet).toContain('<t xml:space="preserve">Customer</t>')
    expect(sheet).toContain('<row r="1201"><c r="A1201" t="inlineStr"><is><t xml:space="preserve">SO-1200</t></is></c><c r="B1201" t="inlineStr"><is><t xml:space="preserve">Initech</t></is></c><c r="C1201" t="inlineStr"><is><t xml:space="preserve">Shipped</t></is></c><c r="D1201" s="2"><v>1199.5</v></c></row>')
    expect(args.abort).not.toHaveBeenCalled()
  },
}

/** Cancel closes the progress at once, reads no further and discards the file. */
export const CancelStopsTheExport: Story = {
  args: { delayMs: 400 },
  play: async ({ canvasElement, args }) => {
    await startExport(canvasElement)
    const progress = within(await within(document.body).findByRole('dialog', { name: 'Exporting orders' }))
    await userEvent.click(progress.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(within(document.body).queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(args.abort).toHaveBeenCalledTimes(1))
    expect(args.search).toHaveBeenCalledTimes(1)
    expect(within(canvasElement).queryByText(/Exported/)).toBeNull()
  },
}
