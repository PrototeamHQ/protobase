import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { ApiError, createStaticSession } from '@protobase/client'
import { App } from './app'
import { fakeInvoiceClient } from './testing/fake-invoice-client'

const session = createStaticSession('story-token', { id: 'story', email: 'story@example.test', name: 'Story User', role: 'user' })

const meta = {
  title: 'Record/Editing lines',
  parameters: { layout: 'fullscreen' },
  // Unsaved changes are kept in local storage; start every story without any.
  beforeEach: () => {
    for (const key of Object.keys(localStorage)) if (key.startsWith('protobase:draft:')) localStorage.removeItem(key)
  },
} satisfies Meta
export default meta

const render = (fake: ReturnType<typeof fakeInvoiceClient>) => () => (
  <div className="h-screen">
    <App client={fake.client} auth={session} initialUrl="/invoices/i1" />
  </div>
)

const lineRows = (canvasElement: HTMLElement) => canvasElement.querySelectorAll('[data-line-id]')

const retype = async (input: HTMLElement, typed: string) => {
  await userEvent.clear(input)
  await userEvent.type(input, typed)
}

const edited = fakeInvoiceClient()
/** A line's field changed, a line added and one removed, all written with the record by one Save. */
export const EditAddRemoveThenSave: StoryObj = {
  tags: ['play'],
  render: render(edited),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await retype(await canvas.findByRole('textbox', { name: 'Quantity, line 1' }), '5')

    await userEvent.click(canvas.getByRole('button', { name: 'Actions for Line C' }))
    await userEvent.click(canvas.getByRole('menuitem', { name: 'Remove line' }))
    await waitFor(() => expect(lineRows(canvasElement)).toHaveLength(2))

    await userEvent.click(canvas.getByRole('button', { name: 'Add line' }))
    await waitFor(() => expect(lineRows(canvasElement)).toHaveLength(3))
    await retype(canvas.getByRole('textbox', { name: 'Description, line 3' }), 'Line D')
    await retype(canvas.getByRole('textbox', { name: 'Quantity, line 3' }), '2')

    expect((await canvas.findAllByText('Unsaved changes')).length).toBeGreaterThan(0)
    expect(edited.batches).toHaveLength(0)
    await userEvent.click(canvas.getAllByRole('button', { name: 'Save' })[0]!)
    await waitFor(() => expect(edited.batches).toHaveLength(1))
    expect(edited.batches[0]).toEqual([
      { op: 'delete', resource: 'invoice_lines', key: 'l3', etag: '"l3-v1"' },
      { op: 'update', resource: 'invoice_lines', key: 'l1', data: { quantity: 5 }, etag: '"l1-v1"' },
      { op: 'create', resource: 'invoice_lines', data: { description: 'Line D', quantity: 2, invoice_id: 'i1', position: 3 } },
    ])
  },
}

const refused = fakeInvoiceClient({
  failBatch: () =>
    new ApiError({
      type: 'urn:protobase:problem:invalid-record',
      title: 'Bad Request',
      status: 400,
      detail: 'The record is invalid.',
      operation: 0,
      errors: [{ field: 'quantity', code: 'invalid-value', message: 'must be at least 1', params: { min: 1 } }],
    }),
})
/** The server turned down a line: the field shows why on that line, and the changes stay to put right. */
export const RefusalShowsOnTheLine: StoryObj = {
  tags: ['play'],
  render: render(refused),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const quantity = await canvas.findByRole('textbox', { name: 'Quantity, line 2' })
    await retype(quantity, '0')
    await userEvent.click(canvas.getAllByRole('button', { name: 'Save' })[0]!)
    expect(await canvas.findByText('Could not save')).toBeInTheDocument()
    await waitFor(() => expect(canvas.getByRole('textbox', { name: 'Quantity, line 2' })).toHaveAttribute('aria-invalid', 'true'))
    expect(canvas.getByRole('textbox', { name: 'Quantity, line 1' })).not.toHaveAttribute('aria-invalid')
    expect(canvas.getByRole('textbox', { name: 'Quantity, line 2' })).toHaveValue('0')
  },
}

const issued = fakeInvoiceClient({ locked: true })
/** A record that cannot change, such as an issued invoice, shows its lines without inputs, handles or Add line. */
export const LockedWhenTheRecordCannotChange: StoryObj = {
  tags: ['play'],
  render: render(issued),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() => expect(lineRows(canvasElement)).toHaveLength(3))
    expect(canvas.queryByRole('button', { name: 'Add line' })).toBeNull()
    expect(canvas.queryAllByRole('button', { name: /Drag to reorder/ })).toHaveLength(0)
    expect(canvas.queryByRole('textbox', { name: 'Quantity, line 1' })).toBeNull()
    expect(canvas.getByText('Line A')).toBeInTheDocument()
  },
}
