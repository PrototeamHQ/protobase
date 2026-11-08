import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { createStaticSession } from '@protobase/client'
import { invoiceItems, invoiceItemsView, invoices, invoicesView, products, productsView } from '../../../../../docs-examples/reference/invoice-items'
import { App } from '../app'
import { fakeApi } from '../testing/fake-api'

const meta = { title: 'List page/Reordering by hand', parameters: { layout: 'fullscreen' } } satisfies Meta
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

// More products than the list API gives in one page
const manyProducts = () => Array.from({ length: 600 }, (_, index) => ({ id: index + 1, name: `Product ${index + 1}`, rank: index + 1 }))

// The ids of the records each move saved wrote, in the order they were saved
const sent: Array<Array<unknown>> = []

type Api = ReturnType<typeof fakeApi>

// With `meanwhile`, someone else changes the records once, after the list loaded and before the first move saves.
const Shop = ({ start, meanwhile, many }: { start: string; meanwhile?: (api: Api) => Promise<unknown>; many?: boolean }) => {
  const [api] = useState(() =>
    fakeApi({
      resources: [products.toModel(), invoices.toModel(), invoiceItems.toModel()],
      views: [productsView.toModel(), invoicesView.toModel(), invoiceItemsView.toModel()],
      rows: { ...rows(), ...(many && { products: manyProducts() }) },
    }),
  )
  const [changed] = useState(() => ({ done: !meanwhile }))
  const client = {
    ...api.client,
    batchWrite: async (ops: Parameters<typeof api.client.batchWrite>[0]) => {
      if (!changed.done) {
        changed.done = true
        await meanwhile!(api)
      }
      const result = await api.client.batchWrite(ops)
      for (const written of result.results) if (written.op === 'move') sent.push(written.records.map((entry) => entry.record.id))
      return result
    },
  }
  return (
    <div className="h-screen">
      <App client={client} auth={session} initialUrl={start} workspace="Pip's bike shop" />
    </div>
  )
}

export const Products: StoryObj = { name: 'A list reordered by hand', render: () => <Shop start="/products" /> }

export const ManyProducts: StoryObj = { name: 'A long list reordered by hand', render: () => <Shop start="/products" many /> }

export const InvoiceItems: StoryObj = { name: "An invoice's items reordered by hand", render: () => <Shop start="/invoices/1" /> }

// Someone else moves Cortina Common up to just after Brompton C Line
const cortinaUp = async (api: Api) => {
  await api.client.update('products', '3', { rank: 4 }, '*')
  await api.client.update('products', '4', { rank: 3 }, '*')
}

export const ChangedMeanwhile: StoryObj = { name: 'A list someone else reorders while you move', render: () => <Shop start="/products" meanwhile={cortinaUp} /> }

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
  name: 'A list reordered by hand (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByRole('button', { name: 'Reorder' }))
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
  name: "An invoice's items reordered by hand (checks)",
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByRole('button', { name: 'Reorder' }))
    // This invoice's items only
    const grid = await canvas.findByRole('grid')
    await waitFor(() => expect(handles(grid)).toEqual(['New chain', 'Brake pads', 'Labour, one hour']))
    await moveByKeyboard(within(grid).getByRole('button', { name: 'Move New chain' }), '{ArrowDown}{ArrowDown}', 'row 3 of 3')
    await waitFor(() => expect(handles(grid)).toEqual(['Brake pads', 'Labour, one hour', 'New chain']))
    await userEvent.click(canvas.getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(within(canvas.getByRole('grid')).getAllByRole('row').slice(1).map((row) => row.textContent?.startsWith('Brake pads'))).toEqual([true, false, false]))
  },
}

export const EditedMeanwhileChecks: StoryObj = {
  name: 'A move after someone else edited the records (checks)',
  tags: ['play', '!dev'],
  render: () => <Shop start="/products" meanwhile={(api) => Promise.all([api.client.update('products', '2', { name: 'Gazelle Ultimate T10' }, '*'), api.client.update('products', '1', { name: 'Brompton C Line Explore' }, '*')])} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByRole('button', { name: 'Reorder' }))
    const grid = await canvas.findByRole('grid')
    await waitFor(() => expect(handles(grid)).toEqual(['Gazelle Ultimate', 'Brompton C Line', 'VanMoof S5', 'Cortina Common']))
    await moveByKeyboard(within(grid).getByRole('button', { name: 'Move Gazelle Ultimate' }), '{ArrowDown}', 'row 2 of 4')
    // Saved, though both records changed since the list loaded, and shown with the names they have now
    expect(await within(document.body).findByText('Order changed')).toBeInTheDocument()
    await waitFor(() => expect(handles(grid)).toEqual(['Brompton C Line Explore', 'Gazelle Ultimate T10', 'VanMoof S5', 'Cortina Common']))
  },
}

export const RefusedChecks: StoryObj = {
  ...ChangedMeanwhile,
  name: 'A move refused because the list changed where it was dropped (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByRole('button', { name: 'Reorder' }))
    const grid = await canvas.findByRole('grid')
    await waitFor(() => expect(handles(grid)).toEqual(['Gazelle Ultimate', 'Brompton C Line', 'VanMoof S5', 'Cortina Common']))
    await moveByKeyboard(within(grid).getByRole('button', { name: 'Move Gazelle Ultimate' }), '{ArrowDown}', 'row 2 of 4')
    // Refused, and the list shows the current order by itself, with no word of reloading
    expect(await within(document.body).findByText('Gazelle Ultimate was not moved')).toBeInTheDocument()
    expect(within(document.body).queryByText(/reload|fetch it again/i)).toBeNull()
    await waitFor(() => expect(handles(grid)).toEqual(['Gazelle Ultimate', 'Brompton C Line', 'Cortina Common', 'VanMoof S5']))
    // The same move again saves
    await moveByKeyboard(within(grid).getByRole('button', { name: 'Move Gazelle Ultimate' }), '{ArrowDown}', 'row 2 of 4')
    expect(await within(document.body).findByText('Order changed')).toBeInTheDocument()
    await waitFor(() => expect(handles(grid)).toEqual(['Brompton C Line', 'Gazelle Ultimate', 'Cortina Common', 'VanMoof S5']))
  },
}

export const ManyProductsChecks: StoryObj = {
  ...ManyProducts,
  name: 'A long list reordered by hand (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    sent.length = 0
    await userEvent.click(await canvas.findByRole('button', { name: 'Reorder' }))
    const grid = await canvas.findByRole('grid')
    await waitFor(() => expect(handles(grid).slice(0, 3)).toEqual(['Product 1', 'Product 2', 'Product 3']))
    await moveByKeyboard(within(grid).getByRole('button', { name: 'Move Product 1' }), '{ArrowDown}{ArrowDown}', 'row 3 of 600')
    await waitFor(() => expect(handles(grid).slice(0, 3)).toEqual(['Product 2', 'Product 3', 'Product 1']))
    // Only the three that moved are saved, not all 600
    await waitFor(() => expect(sent).toEqual([[2, 3, 1]]))
  },
}
