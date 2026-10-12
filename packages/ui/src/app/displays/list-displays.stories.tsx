import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { createStaticSession } from '@protobase/client'
import { component } from '@protobase/layout'
import type { ViewModel } from '@protobase/schema'
import { customers, repairs } from '../../../../../docs-examples/bike-shop/data'
import { customerRows, repairRows } from '../../../../../docs-examples/bike-shop/rows'
import { customersView } from '../../../../../docs-examples/bike-shop/step-5'
import * as workshop from '../../../../../docs-examples/reference/workshop'
import { App } from '../app'
import { defineUi } from '../pages/project-ui'
import { fakeApi } from '../testing/fake-api'
import { RepairBoard } from '../testing/repair-board'
import { BrokenCard, RepairCard } from '../testing/repair-card'

const meta = { title: 'List page/Displays', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'pip', email: 'pip@bikeshop.example', name: 'Pip', role: 'admin' })

const ui = defineUi({ components: { RepairBoard, RepairCard, BrokenCard } })

const Shop = ({ start, repairsView = workshop.repairsView }: { start: string; repairsView?: { toModel(): ViewModel } }) => {
  const [api] = useState(() => fakeApi({ resources: [customers.toModel(), repairs.toModel()], views: [customersView.toModel(), repairsView.toModel()], rows: { customers: customerRows, repairs: repairRows } }))
  return (
    <div className="h-screen">
      <App client={api.client} auth={session} initialUrl={start} ui={ui} workspace="Pip's bike shop" />
    </div>
  )
}

export const Board: StoryObj = { name: 'A custom board, the default', render: () => <Shop start="/repairs" /> }

export const Cards: StoryObj = { name: 'Cards', render: () => <Shop start="/repairs?display=cards" /> }

const Unregistered = component<{ by: string }>('WorkshopCalendar')
const withCalendar = workshop.repairsView.list((r, d) => ({ columns: [r.number], displays: [d.custom(Unregistered, { name: 'calendar', label: 'Calendar', icon: 'calendar', fields: [r.booked_on], props: { by: r.booked_on } })] }))

// The cards drawn by a component: the project's, one that throws, and one nobody registered.
const withCard = (name: string) =>
  workshop.repairsView.list((r, d) => ({
    columns: [r.number],
    displays: [d.cards({ title: r.bike, subtitle: r.customer_id, badge: r.status, meta: [r.number, r.estimate] }, { card: component(name) })],
    default: 'cards',
  }))

export const CardComponent: StoryObj = { name: 'Cards drawn by a component', render: () => <Shop start="/repairs" repairsView={withCard('RepairCard')} /> }

export const CardComponentChecks: StoryObj = {
  ...CardComponent,
  name: 'Cards drawn by a component (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const card = await canvas.findByLabelText('Repair R-305')
    expect(card).toHaveTextContent('Brompton C Line')
    expect(card).toHaveTextContent('Emma Visser')
    expect(card).toHaveTextContent('€42.00')
    // Still a link to the repair, as every card is
    expect(card.closest('a')).toHaveAttribute('href', '/repairs/5')
  },
}

export const CardFallbackChecks: StoryObj = {
  name: 'Cards whose component throws (checks)',
  tags: ['play', '!dev'],
  render: () => <Shop start="/repairs" repairsView={withCard('BrokenCard')} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // The built-in card instead: title, subtitle and badge
    await waitFor(async () => expect(await cardTitles(canvas)).toHaveLength(14))
    expect(canvas.queryByLabelText('Repair R-305')).toBeNull()
    expect((await cardTitles(canvas))[0]).toBe('Gazelle Orange')
  },
}

export const CardMissingChecks: StoryObj = {
  name: 'Cards whose component nobody registered (checks)',
  tags: ['play', '!dev'],
  render: () => <Shop start="/repairs" repairsView={withCard('WorkshopCard')} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(async () => expect(await cardTitles(canvas)).toHaveLength(14))
    expect(canvas.queryByRole('alert')).toBeNull()
  },
}

export const MissingComponent: StoryObj = { name: 'A display nobody registered', render: () => <Shop start="/repairs?display=calendar" repairsView={withCalendar} /> }

const pressed = async (canvas: ReturnType<typeof within>) => {
  const group = await canvas.findByRole('group', { name: 'Display' })
  return within(group).getAllByRole('button').find((button) => button.getAttribute('aria-pressed') === 'true')?.textContent
}

const cardTitles = async (canvas: ReturnType<typeof within>) => {
  const list = await canvas.findByRole('list', { name: 'Repairs' })
  return within(list).getAllByRole('link').map((link) => link.firstElementChild?.firstElementChild?.textContent)
}

export const BoardChecks: StoryObj = {
  ...Board,
  name: 'A custom board, the default (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(await pressed(canvas)).toBe('Board')
    const ready = await canvas.findByRole('region', { name: 'ready' })
    await waitFor(() => expect(within(ready).getAllByRole('link').map((link) => link.textContent)).toEqual(['R-305Brompton C Line', 'R-311Cannondale Topstone']))
    expect(within(ready).getAllByRole('link')[0]).toHaveAttribute('href', '/repairs/5')
    await userEvent.click(within(ready).getAllByRole('link')[0]!)
    await canvas.findByRole('heading', { name: 'R-305' })
  },
}

export const CardsChecks: StoryObj = {
  ...Cards,
  name: 'Cards (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(await pressed(canvas)).toBe('Cards')
    await waitFor(async () => expect(await cardTitles(canvas)).toHaveLength(14))
    const first = within(canvas.getByRole('list', { name: 'Repairs' })).getAllByRole('link')[0]!
    expect(first).toHaveTextContent('VanMoof S5')
    expect(first).toHaveTextContent('Daan Bakker')
    expect(first).toHaveTextContent('Booked')
    expect(canvas.getByText('14 of 14')).toBeVisible()
    await userEvent.selectOptions(canvas.getByRole('combobox', { name: 'Sort' }), 'booked_on asc')
    await waitFor(async () => expect((await cardTitles(canvas))[0]).toBe('Gazelle Orange'))
    await userEvent.click(canvas.getByRole('button', { name: 'Table' }))
    await canvas.findByText('14 rows')
    expect(canvas.queryByRole('combobox', { name: 'Sort' })).toBeNull()
    expect(await pressed(canvas)).toBe('Table')
  },
}

export const FilteredCards: StoryObj = {
  name: 'Cards, filtered (checks)',
  tags: ['play', '!dev'],
  render: () => <Shop start={`/repairs?display=cards&filter=${encodeURIComponent('status = "ready"')}`} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(async () => expect(await cardTitles(canvas)).toEqual(['Brompton C Line', 'Cannondale Topstone']))
    expect(await pressed(canvas)).toBe('Cards')
  },
}

export const UnregisteredChecks: StoryObj = {
  ...MissingComponent,
  name: 'A display nobody registered (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(await canvas.findByRole('alert')).toHaveTextContent('No component is registered as WorkshopCalendar')
  },
}
