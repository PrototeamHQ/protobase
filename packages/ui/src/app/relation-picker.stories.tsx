import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { ApiError, type Client } from '@protobase/client'
import { f, resource, view, type ResourceModel } from '@protobase/schema'
import { ApiProvider } from '../data/api-provider'
import { RelationPicker } from './relation-picker'
import { fakeApi } from './testing/fake-api'

// Categories cannot be searched and their name is not filterable, so the picker narrows them itself, page by page.
const categories = resource('categories')
  .table('categories')
  .fields({ id: f.integer().filterable().sortable(), name: f.text() })
  .primaryKey((r) => r.id)

// Suppliers' name is filterable, so the server narrows them. Without a view, the placeholder names them from the resource.
const suppliers = resource('preferred_suppliers')
  .table('preferred_suppliers')
  .fields({ id: f.integer().filterable().sortable(), name: f.text().filterable() })
  .primaryKey((r) => r.id)

const categoriesView = view<typeof categories>('categories').names({ singular: 'Category', plural: 'Categories' })

// More than one page of categories, with the only zinc one on the second page.
const rows = {
  categories: [
    { id: 1, name: 'Fasteners' },
    { id: 2, name: 'Bolts' },
    { id: 3, name: 'Nuts and washers' },
    ...Array.from({ length: 60 }, (_, index) => ({ id: 10 + index, name: `Shelf ${index + 1}` })),
    { id: 99, name: 'Zinc plating' },
  ],
  preferred_suppliers: [
    { id: 1, name: 'Fabory' },
    { id: 2, name: 'Würth' },
    { id: 3, name: 'Fastenal' },
  ],
}

// A server whose scan guard finds no index for a pattern on a name.
const refusingPatterns = (client: Client) =>
  ({
    ...client,
    list: (resource: string, params?: { filter?: string }) => {
      if (!params?.filter?.includes('*')) return client.list(resource, params)
      return Promise.reject(new ApiError({ type: 'urn:protobase:problem:expensive-query', title: 'Bad Request', status: 400 }))
    },
  }) as Client

const Picker = ({ target, refuse = false }: { target: ResourceModel; refuse?: boolean }) => {
  const [client] = useState(() => {
    const api = fakeApi({ resources: [categories.toModel(), suppliers.toModel()], views: [categoriesView.toModel()], rows: structuredClone(rows) })
    return refuse ? refusingPatterns(api.client) : api.client
  })
  const [chosen, setChosen] = useState({ key: '', label: '' })
  return (
    <ApiProvider client={client}>
      <div className="w-80 p-6">
        <RelationPicker
          target={target}
          view={target.name === 'categories' ? categoriesView.toModel() : undefined}
          value={chosen.key}
          label={chosen.label}
          onChange={(key, label) => setChosen({ key, label })}
        />
        <p className="mt-40">Chosen: {chosen.key || 'none'}</p>
      </div>
    </ApiProvider>
  )
}

const meta = { title: 'Create/Relation picker', tags: ['play'] } satisfies Meta
export default meta

const optionNames = (canvasElement: HTMLElement) => within(canvasElement).queryAllByRole('option').map((option) => option.textContent)

/** Typing narrows the options to the records whose title holds the text, also ones past the first page. */
export const TypingNarrows: StoryObj = {
  render: () => <Picker target={categories.toModel()} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const box = canvas.getByRole('combobox')
    await expect(box).toHaveAttribute('placeholder', 'Search categories')
    await userEvent.type(box, 'fa')
    await waitFor(() => expect(optionNames(canvasElement)).toEqual(['Fasteners']))
    await userEvent.clear(box)
    await userEvent.type(box, 'zinc')
    await waitFor(() => expect(optionNames(canvasElement)).toEqual(['Zinc plating']))
  },
}

/** A filterable title is matched by the server, every word of it; the placeholder names the resource readably. */
export const ServerNarrows: StoryObj = {
  render: () => <Picker target={suppliers.toModel()} />,
  play: async ({ canvasElement }) => {
    const box = within(canvasElement).getByRole('combobox')
    await expect(box).toHaveAttribute('placeholder', 'Search preferred suppliers')
    await userEvent.type(box, 'a')
    await waitFor(() => expect(optionNames(canvasElement)).toEqual(['Fabory', 'Fastenal']))
  },
}

/** When the server refuses the pattern for want of an index, the picker matches the names it loads itself. */
export const RefusedFilterFallsBack: StoryObj = {
  render: () => <Picker target={suppliers.toModel()} refuse />,
  play: async ({ canvasElement }) => {
    await userEvent.type(within(canvasElement).getByRole('combobox'), 'FA')
    await waitFor(() => expect(optionNames(canvasElement)).toEqual(['Fabory', 'Fastenal']))
  },
}

/** Arrow keys move through the options, Enter chooses one, and Escape closes the list without choosing. */
export const Keyboard: StoryObj = {
  render: () => <Picker target={categories.toModel()} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const box = canvas.getByRole('combobox')
    await userEvent.click(box)
    await waitFor(() => expect(canvas.getAllByRole('option').length).toBeGreaterThan(3))
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{ArrowUp}')
    const active = box.getAttribute('aria-activedescendant')
    await expect(canvasElement.querySelector(`[id="${active}"]`)).toHaveTextContent('Bolts')
    await userEvent.keyboard('{Enter}')
    await expect(canvas.getByText('Chosen: 2')).toBeVisible()
    await expect(box).toHaveValue('Bolts')
    // The chosen name is selected, so typing replaces it
    await userEvent.keyboard('nut')
    await waitFor(() => expect(optionNames(canvasElement)).toEqual(['Nuts and washers']))
    await userEvent.keyboard('{Escape}')
    await expect(canvas.queryByRole('listbox')).toBeNull()
    await expect(canvas.getByText('Chosen: 2')).toBeVisible()
    await expect(box).toHaveValue('Bolts')
  },
}

/** Scrolling to the end of the options loads the next page. */
export const ScrollLoadsMore: StoryObj = {
  render: () => <Picker target={categories.toModel()} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('combobox'))
    await waitFor(() => expect(canvas.getAllByRole('option')).toHaveLength(50))
    canvas.getByRole('listbox').scrollTop = 10_000
    await waitFor(() => expect(canvas.getAllByRole('option')).toHaveLength(64))
  },
}
