import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { PreconditionFailedError, type Client } from '@protobase/client'
import type { ResourceModel, ViewModel } from '@protobase/schema'
import { ApiProvider } from '../../data/api-provider'
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
      <ApiProvider client={client}>
        <ToastProvider>
          <Harness onDeleted={onDeleted} onReview={onReview} />
        </ToastProvider>
      </ApiProvider>
    )
  },
} satisfies Meta<HarnessProps>

export default meta
type Story = StoryObj<typeof meta>

const openConflictDialog = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement)
  await userEvent.click(canvas.getByRole('button', { name: 'Delete order' }))
  const confirm = await canvas.findByRole('dialog', { name: /Delete SO-2026-000001\?/ })
  await userEvent.click(within(confirm).getByRole('button', { name: 'Delete' }))
  return canvas.findByRole('dialog', { name: /was changed since you opened it/ })
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
    await waitFor(() => expect(within(canvasElement).queryByRole('dialog')).toBeNull())
  },
}

export const CancelKeepsTheRecord: Story = {
  play: async ({ canvasElement, args }) => {
    await openConflictDialog(canvasElement)
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(within(canvasElement).queryByRole('dialog')).toBeNull())
    expect(args.remove).not.toHaveBeenCalled()
    expect(args.onDeleted).not.toHaveBeenCalled()
  },
}
