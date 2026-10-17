import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { ApiError, createStaticSession, type Client, type ResourcePermissions } from '@protobase/client'
import { f, resource, view } from '@protobase/schema'
import { App } from '../app'
import { fakeApi } from '../testing/fake-api'

const meta = { title: 'List/Editing in the list', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'story', email: 'story@example.test', name: 'Story User', role: 'admin' })

const products = resource('products')
  .table('products')
  .fields({
    id: f.integer().readOnly().filterable().sortable(),
    sku: f.text().readOnly(),
    name: f.text(),
    price: f.decimal({ precision: 10, scale: 2 }),
    status: f.enum(['draft', 'live', 'retired']),
    active: f.boolean(),
  })
  .primaryKey((r) => r.id)

const productsView = view<typeof products>('products')
  .title((r) => r.name)
  .names({ singular: 'Product', plural: 'Products' })
  .fields((r) => ({ price: r.price.prefix('€').decimals(2), status: r.status.valueLabels({ draft: 'Draft', live: 'Live', retired: 'Retired' }) }))
  .list((r) => ({ columns: [r.sku, r.name, r.price, r.status, r.active], sort: [[r.id, 'asc']], editable: [r.name, r.price, r.status, r.active] }))

const rows = {
  products: [
    { id: 1, sku: 'LMP-01', name: 'Desk lamp', price: '19.00', status: 'live', active: true },
    { id: 2, sku: 'CHR-02', name: 'Office chair', price: '149.00', status: 'draft', active: false },
    { id: 3, sku: 'SHF-03', name: 'Book shelf', price: '89.50', status: 'live', active: true },
  ],
}

/** The rows the fake server holds, so a play can check what a save stored. */
let stored: Record<string, Array<Record<string, unknown>>> = {}

type ProductsProps = { canUpdate?: boolean; refuse?: ApiError }

const Products = ({ canUpdate = true, refuse }: ProductsProps) => {
  const [client] = useState(() => {
    const permissions: Record<string, ResourcePermissions> = { products: { read: true, create: true, update: canUpdate, delete: false, conditional: [] } }
    const api = fakeApi({ resources: [products.toModel()], views: [productsView.toModel()], rows: structuredClone(rows), permissions })
    stored = api.rows
    return refuse ? ({ ...api.client, update: () => Promise.reject(refuse) } as unknown as Client) : api.client
  })
  return (
    <div className="min-h-screen">
      <App client={client} auth={session} initialUrl="/products" />
    </div>
  )
}

// The cell of the row showing `rowText` in the column at `column`, counted from the first after the selection
const cellOf = async (canvasElement: HTMLElement, rowText: string, column: number) => {
  const canvas = within(canvasElement)
  const row = (await canvas.findByText(rowText)).closest<HTMLElement>('[role=row]')!
  return within(row).getAllByRole('gridcell')[column]!
}

const product = (id: number) => stored.products!.find((row) => row.id === id)!

export const Editable: StoryObj = {
  render: () => <Products />,
}

export const EditInPlace: StoryObj = {
  tags: ['play'],
  render: () => <Products />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    // A click chooses an editable cell instead of opening the record; a second one edits it
    const name = await cellOf(canvasElement, 'LMP-01', 1)
    await userEvent.click(name)
    expect(name).toHaveAttribute('aria-selected', 'true')
    expect(canvas.getByRole('heading', { name: 'Products' })).toBeInTheDocument()

    // A double-click opens the price's editor; Enter saves it
    await userEvent.dblClick(await cellOf(canvasElement, 'LMP-01', 2))
    const price = within(await cellOf(canvasElement, 'LMP-01', 2)).getByRole('textbox')
    await userEvent.clear(price)
    await userEvent.type(price, '24.50{Enter}')
    await waitFor(() => expect(product(1).price).toBe('24.50'))
    expect(await cellOf(canvasElement, 'LMP-01', 2)).toHaveTextContent('24.50')

    // The arrow keys move to the status, Enter opens its choice, and a choice saves at once
    await userEvent.keyboard('{ArrowRight}')
    const status = await cellOf(canvasElement, 'LMP-01', 3)
    expect(status).toHaveAttribute('aria-selected', 'true')
    await userEvent.keyboard('{Enter}')
    await userEvent.selectOptions(within(status).getByRole('combobox'), 'Retired')
    await waitFor(() => expect(product(1).status).toBe('retired'))
    expect(await cellOf(canvasElement, 'LMP-01', 3)).toHaveTextContent('Retired')

    // Down a row, Tab from the name saves it and goes on to edit the price
    await userEvent.keyboard('{ArrowDown}{ArrowLeft}{ArrowLeft}{Enter}')
    const chair = within(await cellOf(canvasElement, 'CHR-02', 1)).getByRole('textbox')
    await userEvent.clear(chair)
    await userEvent.type(chair, 'Desk chair{Tab}')
    await waitFor(() => expect(product(2).name).toBe('Desk chair'))
    const chairPrice = within(await cellOf(canvasElement, 'CHR-02', 2)).getByRole('textbox')

    // Escape leaves the value as it was
    await userEvent.clear(chairPrice)
    await userEvent.type(chairPrice, '1{Escape}')
    expect(product(2).price).toBe('149.00')
    expect(await cellOf(canvasElement, 'CHR-02', 2)).toHaveTextContent('149.00')

    // A click outside the grid saves the change and leaves the focus where it went
    await userEvent.dblClick(await cellOf(canvasElement, 'SHF-03', 1))
    const shelf = within(await cellOf(canvasElement, 'SHF-03', 1)).getByRole('textbox')
    await userEvent.clear(shelf)
    await userEvent.type(shelf, 'Wall shelf')
    await userEvent.click(canvas.getByRole('heading', { name: 'Products' }))
    await waitFor(() => expect(product(3).name).toBe('Wall shelf'))
    expect(canvasElement.ownerDocument.activeElement?.getAttribute('role')).not.toBe('gridcell')

    // A cell that is not editable opens its record on Enter
    await userEvent.click(await cellOf(canvasElement, 'CHR-02', 1))
    await userEvent.keyboard('{ArrowLeft}{Enter}')
    expect(await canvas.findByRole('heading', { name: 'Desk chair', level: 1 })).toBeInTheDocument()
  },
}

export const EditRefused: StoryObj = {
  tags: ['play'],
  render: () => (
    <Products
      refuse={new ApiError({ type: 'urn:protobase:problem:invalid-record', title: 'Unprocessable Entity', status: 422, detail: 'The record is not valid', errors: [{ field: 'price', message: 'Price must be below 100' }] })}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.dblClick(await cellOf(canvasElement, 'LMP-01', 2))
    const price = within(await cellOf(canvasElement, 'LMP-01', 2)).getByRole('textbox')
    await userEvent.clear(price)
    await userEvent.type(price, '240{Enter}')
    // The toast is portalled to the body, outside the canvas
    expect(await within(canvasElement.ownerDocument.body).findByText('Price must be below 100')).toBeInTheDocument()
    expect(await cellOf(canvasElement, 'LMP-01', 2)).toHaveTextContent('19.00')
    expect(canvas.getByRole('heading', { name: 'Products' })).toBeInTheDocument()
  },
}

export const WithoutUpdate: StoryObj = {
  tags: ['play'],
  render: () => <Products canUpdate={false} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByText('LMP-01')
    // A user who may not change the records gets the plain table, whose rows open their record
    expect(canvas.queryAllByRole('gridcell')).toHaveLength(0)
    await userEvent.click(await canvas.findByText('Desk lamp'))
    expect(await canvas.findByRole('heading', { name: 'Desk lamp', level: 1 })).toBeInTheDocument()
  },
}
