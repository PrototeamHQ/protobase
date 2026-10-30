import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { createStaticSession, type ResourcePermissions } from '@protobase/client'
import { f, resource, view } from '@protobase/schema'
import { App } from '../app'
import { fakeApi } from '../testing/fake-api'
import { home } from './story-page'

const viewports = { phone360: { name: 'Phone 360', styles: { width: '360px', height: '740px' }, type: 'mobile' } } as const

const meta = { title: 'Pages/Record row', parameters: { layout: 'fullscreen', viewport: { options: viewports } } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'pip', email: 'pip@homes.example', name: 'Pip', role: 'member' })

const homes = resource('homes')
  .table('homes')
  .fields({
    id: f.integer().readOnly().filterable(),
    address: f.text().filterable().sortable(),
    rent: f.decimal({ precision: 10, scale: 2 }).filterable().sortable(),
    garden: f.boolean().filterable(),
    published_at: f.timestamp().filterable().sortable(),
  })
  .primaryKey((r) => r.id)

const homesView = view<typeof homes>('homes')
  .title((r) => r.address)
  .names({ singular: 'Home', plural: 'Homes' })
  .fields((r) => ({ rent: r.rent.prefix('€').currency('EUR').suffix(' /month').decimals(0) }))
  .list((r, d) => ({ columns: [r.address, r.rent, r.garden], sort: [[r.published_at, 'desc']], displays: [d.cards({ title: r.address, amount: [r.rent], flags: [r.garden] })] }))
  .filters((r, w) => [w.range(r.rent), w.toggle(r.garden)])

// Forty homes, every other one with a garden, one published each day before 12 October
const homeRows = Array.from({ length: 40 }, (_, index) => ({
  id: index + 1,
  address: `Tuinstraat ${index + 1}`,
  rent: String(1200 + index * 25),
  garden: index % 2 === 0,
  published_at: new Date(Date.UTC(2026, 9, 11 - index, 9)).toISOString(),
}))

const readOnly: ResourcePermissions = { create: false, update: false, delete: false, conditional: [] }

const HomePage = () => {
  const [api] = useState(() => fakeApi({ resources: [homes.toModel()], views: [homesView.toModel(homes.toModel())], pages: [home.toModel()], rows: { homes: homeRows }, permissions: { homes: readOnly } }))
  return (
    <div className="h-screen">
      <App client={api.client} auth={session} initialUrl="/home" workspace="Homes" />
    </div>
  )
}

export const Rows: StoryObj = { name: 'What filters find, in rows of cards', render: () => <HomePage /> }

export const RowsChecks: StoryObj = {
  ...Rows,
  name: 'What filters find, in rows of cards (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // Each row says what it filters on and how many match, with its records as cards that link to them, and "View all"
    // opens the list with its filter
    const gardens = within(await canvas.findByRole('region', { name: 'With a garden' }))
    expect(gardens.getByRole('list', { name: 'Filters' })).toHaveTextContent('Garden')
    expect(await gardens.findByText('20 homes')).toBeVisible()
    expect(await gardens.findByRole('link', { name: /Tuinstraat 1\b/ })).toHaveAttribute('href', '/homes/1')
    expect(gardens.getByRole('link', { name: /^View all/ })).toHaveAttribute('href', `/homes?${new URLSearchParams({ display: 'cards', filter: 'garden = true' })}`)
    await userEvent.click(gardens.getByRole('button', { name: 'Next homes' }))
    await waitFor(() => expect(gardens.getByRole('button', { name: 'Previous homes' })).toBeVisible())

    // A limit keeps to the first records, while the count says how many match
    const cheap = within(canvas.getByRole('region', { name: 'Under €1,300' }))
    expect(await cheap.findByText('5 homes')).toBeVisible()
    await waitFor(() => expect(cheap.getAllByRole('link', { name: /Tuinstraat/ })).toHaveLength(3))

    expect(await within(canvas.getByRole('region', { name: 'Over €5,000' })).findByText('Nothing that dear yet.')).toBeVisible()
  },
}

export const RowsPhone: StoryObj = {
  name: 'What filters find, on a phone',
  globals: { viewport: { value: 'phone360' } },
  tags: ['play', 'phone'],
  render: () => <HomePage />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const gardens = within(await canvas.findByRole('region', { name: 'With a garden' }))
    const row = await gardens.findByRole('list', { name: 'Homes' })
    await waitFor(() => expect(row.scrollWidth).toBeGreaterThan(row.clientWidth))
    expect(row.getBoundingClientRect().right).toBeLessThanOrEqual(360)
    // A swipe scrolls the row; the arrows are for a pointer
    expect(gardens.queryByRole('button', { name: 'Next homes' })).toBeNull()
  },
}
