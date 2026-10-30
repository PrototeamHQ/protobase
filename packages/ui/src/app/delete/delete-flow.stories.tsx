import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { ApiError, PreconditionFailedError, type Client } from '@protobase/client'
import { appPath, type ResourceModel, type ViewModel } from '@protobase/schema'
import { ApiProvider } from '../../data/api-provider'
import { MetaContext } from '../../data/meta-context'
import type { MetaData } from '../../data/meta-data'
import { Router } from '../router'
import { Button } from '../../primitives/button'
import { ToastProvider } from '../../toasts'
import { useDeleteFlow, type DeleteTarget } from './use-delete-flow'

const field = (name: string, type: string, extra = {}) => ({ name, column: name, type, nullable: false, readOnly: false, filterable: false, sortable: false, aliases: [], ...extra })

const model = {
  name: 'orders',
  table: { schema: 'sales', name: 'orders' },
  primaryKey: ['id'],
  fields: { id: field('id', 'uuid', { readOnly: true }), number: field('number', 'text'), status: field('status', 'enum', { enumValues: ['draft', 'confirmed'] }), notes: field('notes', 'text', { nullable: true }) },
} as unknown as ResourceModel

const view = { resource: 'orders', names: { singular: 'Order', plural: 'Orders' }, fields: { status: { valueLabels: { draft: 'Draft', confirmed: 'Confirmed' } } }, filters: [], layout: [], actions: [] } as unknown as ViewModel

const lines = { name: 'order_lines', table: { schema: 'sales', name: 'order_lines' }, primaryKey: ['id'], fields: { id: field('id', 'uuid'), order_id: field('order_id', 'relation', { filterable: true, relation: { resource: 'orders', columns: ['order_id'] } }) } } as unknown as ResourceModel
const linesView = { resource: 'order_lines', names: { singular: 'Order line', plural: 'Order lines' }, fields: {}, filters: [], layout: [], actions: [] } as unknown as ViewModel

// The app's `/meta`, which names the order lines that may keep an order from being deleted.
const adminMeta: MetaData = { etag: '"meta"', appName: 'Protobase', resources: { orders: model, order_lines: lines }, views: { orders: view, order_lines: linesView }, pages: {}, permissions: {} }

const opened = { id: 'o1', number: 'SO-2026-000001', status: 'draft', notes: null }
const changed = { ...opened, status: 'confirmed', notes: 'Call the customer first' }
const target: DeleteTarget = { key: 'o1', title: 'SO-2026-000001', etag: '"v1"', snapshot: opened }

type HarnessProps = {
  remove: (resource: string, key: string, options?: { etag?: string }) => Promise<void>
  get: (resource: string, key: string) => Promise<{ record: Record<string, unknown>; etag: string }>
  onDeleted: () => void
  onReview: () => void
}

const Harness = ({ onDeleted, onReview }: Pick<HarnessProps, 'onDeleted' | 'onReview'>) => {
  const flow = useDeleteFlow({ model, view, onDeleted, onReview })
  return (
    <div className="p-6">
      <Button onClick={() => void flow.start(target)}>Delete order</Button>
      {flow.dialogs}
    </div>
  )
}

/** The record changed after it was opened: a delete with the old version gets a 412, one with `*` goes through. */
const staleVersion = (remove: HarnessProps['remove']) => async (resource: string, key: string, options?: { etag?: string }) => {
  if (options?.etag !== '*') throw new PreconditionFailedError({ type: 'urn:protobase:problem:precondition-failed', title: 'Precondition Failed', status: 412, detail: 'The record changed since it was read' })
  await remove(resource, key, options)
}

const meta = {
  title: 'Delete/Flow',
  tags: ['play'],
  parameters: { layout: 'centered' },
  args: {
    remove: fn(async () => undefined),
    get: fn(async () => ({ record: changed, etag: '"v2"' })),
    onDeleted: fn(),
    onReview: fn(),
  },
  render: ({ remove, get, onDeleted, onReview }) => {
    const client = { remove: staleVersion(remove), get } as unknown as Client
    return (
      <Router initialUrl="/orders">
        <MetaContext.Provider value={adminMeta}>
          <ApiProvider client={client}>
            <ToastProvider>
              <Harness onDeleted={onDeleted} onReview={onReview} />
            </ToastProvider>
          </ApiProvider>
        </MetaContext.Provider>
      </Router>
    )
  },
} satisfies Meta<HarnessProps>

export default meta
type Story = StoryObj<typeof meta>

const openConflictDialog = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement)
  await userEvent.click(canvas.getByRole('button', { name: 'Delete order' }))
  const confirm = await within(document.body).findByRole('dialog', { name: /Delete SO-2026-000001\?/ })
  await userEvent.click(within(confirm).getByRole('button', { name: 'Delete' }))
  return within(document.body).findByRole('dialog', { name: /was changed since you opened it/ })
}

export const DeleteAnywayAfterConflict: Story = {
  play: async ({ canvasElement, args }) => {
    const conflict = await openConflictDialog(canvasElement)
    expect(args.remove).toHaveBeenCalledTimes(0)
    expect(within(conflict).getByText('Status')).toBeVisible()
    expect(within(conflict).getByText('Confirmed')).toBeVisible()
    expect(within(conflict).getByText('Call the customer first')).toBeVisible()

    await userEvent.click(within(conflict).getByRole('button', { name: 'Delete anyway' }))
    await waitFor(() => expect(args.remove).toHaveBeenCalledTimes(1))
    expect(args.remove).toHaveBeenCalledWith('orders', 'o1', { etag: '*' })
    await waitFor(() => expect(args.onDeleted).toHaveBeenCalledTimes(1))
    expect(await within(canvasElement).findByText('SO-2026-000001 deleted')).toBeInTheDocument()
  },
}

export const ReviewChangesKeepsTheRecord: Story = {
  play: async ({ canvasElement, args }) => {
    const conflict = await openConflictDialog(canvasElement)
    await userEvent.click(within(conflict).getByRole('button', { name: 'Review changes' }))
    await waitFor(() => expect(args.onReview).toHaveBeenCalledTimes(1))
    expect(args.remove).not.toHaveBeenCalled()
    expect(args.onDeleted).not.toHaveBeenCalled()
    await waitFor(() => expect(within(document.body).queryByRole('dialog')).toBeNull())
  },
}

export const CancelKeepsTheRecord: Story = {
  play: async ({ canvasElement, args }) => {
    await openConflictDialog(canvasElement)
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(within(document.body).queryByRole('dialog')).toBeNull())
    expect(args.remove).not.toHaveBeenCalled()
    expect(args.onDeleted).not.toHaveBeenCalled()
  },
}

export const BlockedDeleteNamesWhatPointsAtIt: Story = {
  args: {
    remove: fn(async () => {
      throw new ApiError({ type: 'urn:protobase:problem:conflict', title: 'Conflict', status: 409, detail: 'Other records still point at this record', blockedBy: { resource: 'order_lines', field: 'order_id' } })
    }),
  },
  play: async ({ canvasElement }) => {
    const conflict = await openConflictDialog(canvasElement)
    await userEvent.click(within(conflict).getByRole('button', { name: 'Delete anyway' }))
    const canvas = within(canvasElement)
    expect(await canvas.findByText('Order lines still point at this order.')).toBeInTheDocument()
    expect(canvas.getByText('Could not delete SO-2026-000001')).toBeInTheDocument()
    expect(canvas.getByRole('link', { name: 'Show order lines' })).toHaveAttribute('href', appPath({ kind: 'list', resource: 'order_lines', filter: 'order_id = "o1"' }))
  },
}
