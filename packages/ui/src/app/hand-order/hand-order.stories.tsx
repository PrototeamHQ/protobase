import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { ApiError, createStaticSession } from '@protobase/client'
import { invoiceItems, invoiceItemsView, invoices, invoicesView, products, productsView } from '../../../../../docs-examples/reference/invoice-items'
import { App } from '../app'
import { fakeApi } from '../testing/fake-api'

const meta = { title: 'List page/Sorting by hand', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'pip', email: 'pip@bikeshop.example', name: 'Pip', role: 'admin' })

const rows = () => ({
  products: [
    { id: 1, name: 'Brompton C Line', rank: 2 },
    { id: 2, name: 'Gazelle Ultimate', rank: 1 },
    { id: 3, name: 'VanMoof S5', rank: 3 },
    { id: 4, name: 'Cortina Common', rank: 4 },
  ],
  invoices: [
    { id: 1, number: 'INV-2026-0012', customer: 'Emma Visser' },
    { id: 2, number: 'INV-2026-0013', customer: 'Daan de Vries' },
  ],
  invoice_items: [
    { id: 1, invoice_id: 1, position: 1, description: 'New chain', amount: '24.00' },
    { id: 2, invoice_id: 1, position: 2, description: 'Brake pads', amount: '18.50' },
    { id: 3, invoice_id: 1, position: 3, description: 'Labour, one hour', amount: '55.00' },
    { id: 4, invoice_id: 2, position: 1, description: 'Inner tube', amount: '9.00' },
  ],
})

// With `refuse`, the server refuses every reorder, as it does when someone else changed a record since it loaded.
const Shop = ({ start, refuse }: { start: string; refuse?: boolean }) => {
  const [api] = useState(() =>
    fakeApi({
      resources: [products.toModel(), invoices.toModel(), invoiceItems.toModel()],
      views: [productsView.toModel(), invoicesView.toModel(), invoiceItemsView.toModel()],
      rows: rows(),
    }),
  )
  const client = refuse
    ? {
        ...api.client,
        batchWrite: async () => {
          throw new ApiError({ type: 'urn:protobase:problem:precondition-failed', title: 'Precondition Failed', status: 412, detail: 'The record changed since it was read; fetch it again' })
        },
      }
    : api.client
  return (
    <div className="h-screen">
      <App client={client} auth={session} initialUrl={start} workspace="Pip's bike shop" />
    </div>
  )
}

export const Products: StoryObj = { name: 'A list sorted by hand', render: () => <Shop start="/products" /> }

export const InvoiceItems: StoryObj = { name: "An invoice's items sorted by hand", render: () => <Shop start="/invoices/1" /> }

const handles = (region: HTMLElement) => within(region).getAllByRole('button', { name: /^Move / }).map((handle) => handle.getAttribute('aria-label')!.slice('Move '.length))

// Space picks the row up from its handle, the arrow keys move it and Space drops it; each key waits for what the grid
// tells a screen reader, so the next one lands once the grid listens for it.
const moveByKeyboard = async (handle: HTMLElement, steps: string, to: string) => {
  const announced = (text: string) => waitFor(() => expect(within(document.body).getByText(text, { exact: false })).toBeInTheDocument())
  handle.focus()
  await userEvent.keyboard(' ')
  // Picking it up puts it over its own row, which a screen reader is told right after
  await announced('is over row ')
  await userEvent.keyboard(steps)
  await announced(`is over ${to}.`)
  await userEvent.keyboard(' ')
}

export const ProductsChecks: StoryObj = {
  ...Products,
  name: 'A list sorted by hand (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByRole('button', { name: 'Sort' }))
    // Every product in its order, a handle where the checkbox was
    const grid = await canvas.findByRole('grid')
    await waitFor(() => expect(handles(grid)).toEqual(['Gazelle Ultimate', 'Brompton C Line', 'VanMoof S5', 'Cortina Common']))
    expect(within(grid).queryByRole('checkbox')).toBeNull()
    await moveByKeyboard(within(grid).getByRole('button', { name: 'Move Cortina Common' }), '{ArrowUp}{ArrowUp}{ArrowUp}', 'row 1 of 4')
    await waitFor(() => expect(handles(grid)).toEqual(['Cortina Common', 'Gazelle Ultimate', 'Brompton C Line', 'VanMoof S5']))
    // Saved: the list, in the order of the field, has it too
    await userEvent.click(canvas.getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(within(canvas.getByRole('grid')).getAllByRole('row').slice(1, 3).map((row) => row.textContent)).toEqual(['Cortina Common', 'Gazelle Ultimate']))
  },
}

export const InvoiceItemsChecks: StoryObj = {
  ...InvoiceItems,
  name: "An invoice's items sorted by hand (checks)",
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByRole('button', { name: 'Sort' }))
    // This invoice's items only
    const grid = await canvas.findByRole('grid')
    await waitFor(() => expect(handles(grid)).toEqual(['New chain', 'Brake pads', 'Labour, one hour']))
    await moveByKeyboard(within(grid).getByRole('button', { name: 'Move New chain' }), '{ArrowDown}{ArrowDown}', 'row 3 of 3')
    await waitFor(() => expect(handles(grid)).toEqual(['Brake pads', 'Labour, one hour', 'New chain']))
    await userEvent.click(canvas.getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(within(canvas.getByRole('grid')).getAllByRole('row').slice(1).map((row) => row.textContent?.startsWith('Brake pads'))).toEqual([true, false, false]))
  },
}

export const RefusedChecks: StoryObj = {
  name: 'A move the server refuses (checks)',
  tags: ['play', '!dev'],
  render: () => <Shop start="/products" refuse />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByRole('button', { name: 'Sort' }))
    const grid = await canvas.findByRole('grid')
    await waitFor(() => expect(handles(grid)).toEqual(['Gazelle Ultimate', 'Brompton C Line', 'VanMoof S5', 'Cortina Common']))
    await moveByKeyboard(within(grid).getByRole('button', { name: 'Move Gazelle Ultimate' }), '{ArrowDown}', 'row 2 of 4')
    // Put back, with the reason
    expect(await within(document.body).findByText('Could not change the order')).toBeInTheDocument()
    await waitFor(() => expect(handles(grid)).toEqual(['Gazelle Ultimate', 'Brompton C Line', 'VanMoof S5', 'Cortina Common']))
  },
}
