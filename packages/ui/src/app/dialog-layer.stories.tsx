import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, within } from 'storybook/test'
import { createStaticSession } from '@protobase/client'
import { f, l, resource, view } from '@protobase/schema'
import { App } from './app'
import type { ActionInputProps } from './pages/action-inputs/action-inputs-dialog'
import { fakeApi } from './testing/fake-api'

const meta = { title: 'Record page/Action dialog over a related table', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'story', email: 'story@example.test', name: 'Story User', role: 'admin' })

// An invoice whose page lists its lines below its fields, with enough lines that the table's sticky header crosses the
// dialog's buttons once the page is scrolled down, and a Send action that asks first and takes a custom input.

const invoices = resource('invoices')
  .table('invoices')
  .fields({ id: f.integer().readOnly().filterable().sortable(), number: f.text(), client: f.text(), state: f.enum(['draft', 'sent']).filterable() })
  .primaryKey((r) => r.id)

const lines = resource('invoice_lines')
  .table('invoice_lines')
  .fields({ id: f.integer().readOnly().filterable().sortable(), invoice_id: f.relation('invoices').filterable(), product: f.text().sortable(), description: f.text() })
  .primaryKey((r) => r.id)

const invoicesView = view<typeof invoices>('invoices')
  .title((r) => r.number)
  .names({ singular: 'Invoice', plural: 'Invoices' })
  .actions((a) => [a.update('send', { label: 'Send', confirm: 'The client gets the invoice by email.', inputs: (i) => [i.custom('message', { label: 'Message', component: 'MessageInput', optional: true })], set: { state: 'sent' } })])
  .layout((r) => [l.section('Invoice', [r.number, r.client, r.state]), l.related('Lines', { resource: 'invoice_lines', field: 'invoice_id', columns: ['product', 'description'], limit: 50 })])

const linesView = view<typeof lines>('invoice_lines')
  .title((r) => r.product)
  .names({ singular: 'Line', plural: 'Lines' })
  .list((r) => ({ columns: [r.product, r.description] }))

const MessageInput = ({ value, onChange }: ActionInputProps<string>) => <textarea aria-label="Message" value={value ?? ''} onChange={(event) => onChange(event.target.value)} className="w-full rounded-md border p-2" />

const rows = () => ({
  invoices: [{ id: 1, number: '2026-014', client: 'Acme', state: 'draft' }],
  invoice_lines: Array.from({ length: 40 }, (_, index) => ({ id: index + 1, invoice_id: 1, product: `Product ${index + 1}`, description: `Work on part ${index + 1}` })),
})

const Invoice = () => {
  const [api] = useState(() =>
    fakeApi({ resources: [invoices.toModel(), lines.toModel()], views: [invoicesView.toModel(invoices.toModel()), linesView.toModel(lines.toModel())], rows: rows() }),
  )
  return <App client={api.client} auth={session} initialUrl="/invoices/1" ui={{ components: { MessageInput } }} />
}

// Whether a mouse press at the centre of the button lands on it, rather than on something painted above it.
const onTop = (button: HTMLElement) => {
  const box = button.getBoundingClientRect()
  const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
  return hit !== null && button.contains(hit)
}

/**
 * With the page scrolled so the lines table's header row runs across the dialog's buttons, the Send dialog and
 * its backdrop are painted above it: a press on the dialog's Cancel or Send lands on that button, not on a column header.
 */
export const AboveStickyHeader: StoryObj = {
  tags: ['play'],
  render: () => <Invoice />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const heading = await canvas.findByRole('heading', { name: 'Lines' }, { timeout: 5000 })
    const region = heading.closest('section')!
    await within(region).findByText('Product 40', {}, { timeout: 5000 })
    const header = within(region).getAllByRole('row')[0]!
    // Where the dialog's Send sits, then the page scrolled so the header row runs across it, and the dialog opened again
    const open = async () => {
      await userEvent.click(canvas.getAllByRole('button', { name: 'Send' })[0]!)
      return within(document.body).findByRole('dialog', { name: 'Send' })
    }
    const first = await open()
    const at = within(first).getByRole('button', { name: 'Send' }).getBoundingClientRect()
    await userEvent.keyboard('{Escape}')
    window.scrollBy(0, header.getBoundingClientRect().top - at.top)
    const dialog = await open()
    const cancel = within(dialog).getByRole('button', { name: 'Cancel' })
    const send = within(dialog).getByRole('button', { name: 'Send' })
    const headerBox = header.getBoundingClientRect()
    const sendBox = send.getBoundingClientRect()
    await expect(headerBox.top < sendBox.bottom && headerBox.bottom > sendBox.top).toBe(true)
    await expect(onTop(cancel)).toBe(true)
    await expect(onTop(send)).toBe(true)
  },
}
