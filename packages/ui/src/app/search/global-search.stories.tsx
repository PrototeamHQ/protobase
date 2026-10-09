import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { createStaticSession } from '@protobase/client'
import { customers, repairs } from '../../../../../docs-examples/bike-shop/data'
import { customerRows, repairRows } from '../../../../../docs-examples/bike-shop/rows'
import { customersView, repairsView } from '../../../../../docs-examples/bike-shop/step-2'
import { App } from '../app'
import { fakeApi } from '../testing/fake-api'

const meta = { title: 'App/Global search', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'pip', email: 'pip@bikeshop.example', name: 'Pip', role: 'admin' })

// Customers are also found by the end of their phone number, and show their email under the name unless the phone
// number is what matched. Repairs have no search result config: the bike, their first search field after the title.
const searchedCustomers = customers.search((r) => [r.name, r.email, r.phone.digitsEnd()])
const customersResult = customersView.searchResult((r) => ({ title: r.name, subtitle: r.email }))

/** The global search's requests to the list API, five records per resource. */
let searches: string[] = []

/** The bike shop's admin, whose customers and repairs both have search fields. */
const Shop = () => {
  const [client] = useState(() => {
    searches = []
    const api = fakeApi({ resources: [searchedCustomers.toModel(), repairs.toModel()], views: [customersResult.toModel(), repairsView.toModel()], rows: { customers: customerRows, repairs: repairRows } })
    const list: typeof api.client.list = (resource, params = {}) => {
      if (typeof params.filter === 'string' && params.filter.startsWith('search(') && params.pageSize === 5) searches.push(`${resource} ${params.filter}`)
      return api.client.list(resource, params)
    }
    return { ...api.client, list }
  })
  return (
    <div className="h-screen">
      <App client={client} auth={session} initialUrl="/customers" workspace="Pip's bike shop" />
    </div>
  )
}

/** Each line of a result: the bold title, then the subtitle when there is one. */
const lines = (option: HTMLElement) => [...option.children].map((line) => line.textContent)

const results = async (canvas: ReturnType<typeof within>, expected: Array<Array<string | null>>) => {
  const list = await canvas.findByRole('listbox', { name: 'Search results' })
  await waitFor(() => {
    const found = within(list).getAllByRole('option').map(lines)
    expect(found, JSON.stringify(found)).toEqual(expected)
  })
  return list
}

export const SearchTheShop: StoryObj = { render: () => <Shop /> }

export const OpensTheRecord: StoryObj = {
  tags: ['play'],
  render: () => <Shop />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const box = await canvas.findByRole('combobox', { name: 'Global search' })
    expect(box).toHaveAttribute('placeholder', 'Search customers and repairs')
    await userEvent.click(box)
    await userEvent.type(box, 'brompton')
    const list = await results(canvas, [['R-305', 'Brompton C Line'], ['R-310', 'Brompton C Line']])
    expect(within(list).getByRole('group', { name: 'Repairs' })).toBeVisible()
    expect(within(list).getAllByRole('option').map((option) => option.getAttribute('href'))).toEqual(['/repairs/5', '/repairs/10'])
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}')
    expect(await canvas.findByRole('heading', { name: 'R-310' })).toBeVisible()
    expect(canvas.queryByRole('listbox')).toBeNull()
    expect(box).toHaveValue('brompton')
    await userEvent.keyboard('{Control>}k{/Control}')
    expect(box).toHaveFocus()
    await userEvent.clear(box)
    await userEvent.type(box, 'anouk')
    await userEvent.click(await canvas.findByRole('option', { name: /^Anouk de Vries/ }))
    expect(await canvas.findByRole('heading', { name: 'Anouk de Vries' })).toBeVisible()
  },
}

const gazelles = [['R-301', 'Gazelle Orange'], ['R-307', 'Gazelle Orange'], ['R-313', 'Gazelle Orange']]

export const ReopensWithoutAsking: StoryObj = {
  tags: ['play'],
  render: () => <Shop />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const box = await canvas.findByRole('combobox', { name: 'Global search' })
    await userEvent.type(box, 'gazelle')
    await results(canvas, gazelles)
    expect(searches).toEqual(['customers search("gazelle")', 'repairs search("gazelle")'])
    await userEvent.click(canvas.getByRole('option', { name: /^R-307/ }))
    expect(await canvas.findByRole('heading', { name: 'R-307' })).toBeVisible()
    expect(canvas.queryByRole('listbox')).toBeNull()
    expect(box).toHaveValue('gazelle')
    // Back in the box: the same results, without asking the server again
    await userEvent.click(box)
    await results(canvas, gazelles)
    expect(searches).toHaveLength(2)
    // Changed text asks again; clearing empties the box and the results
    await userEvent.type(box, ' orange')
    await waitFor(() => expect(searches.slice(2)).toEqual(['customers search("gazelle orange")', 'repairs search("gazelle orange")']))
    await results(canvas, gazelles)
    await userEvent.click(canvas.getByRole('button', { name: 'Clear search' }))
    expect(box).toHaveValue('')
    expect(canvas.queryByRole('listbox')).toBeNull()
  },
}

export const ContextualSubtitle: StoryObj = {
  tags: ['play'],
  render: () => <Shop />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const box = await canvas.findByRole('combobox', { name: 'Global search' })
    // By name: the configured subtitle, the email
    await userEvent.type(box, 'emma')
    await results(canvas, [['Emma Visser', 'emma@example.nl']])
    // By the end of the phone number, however it is written: the phone number
    for (const text of ['7890', '34567890', '+31 6 3456 7890']) {
      await userEvent.clear(box)
      await userEvent.type(box, text)
      await results(canvas, [['Emma Visser', '+31 6 3456 7890']])
    }
    // Not by its start or middle
    for (const text of ['+316', '3456']) {
      await userEvent.clear(box)
      await userEvent.type(box, text)
      expect(await canvas.findByText(`No matches for “${text}”`)).toBeVisible()
    }
    // A repair has the bike under it, its first search field after the title, unless the problem is what matched
    await userEvent.clear(box)
    await userEvent.type(box, 'hinge')
    await results(canvas, [['R-305', 'Hinge clamp loose']])
  },
}
