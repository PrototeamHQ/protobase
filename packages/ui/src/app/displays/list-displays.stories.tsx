import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { ApiError, createStaticSession } from '@protobase/client'
import { component } from '@protobase/layout'
import { enumLabel, type ViewModel } from '@protobase/schema'
import { customers, repairs } from '../../../../../docs-examples/bike-shop/data'
import { customerRows, repairRows } from '../../../../../docs-examples/bike-shop/rows'
import { repairsView as tableOnlyRepairsView } from '../../../../../docs-examples/bike-shop/step-2'
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

// With `refuse`, the server refuses every update with the reason `validate` gives, as the real one does for a bike that
// leaves the shop unpaid.
const Shop = ({ start, repairsView = workshop.repairsView, refuse }: { start: string; repairsView?: { toModel(): ViewModel }; refuse?: string }) => {
  const [api] = useState(() => fakeApi({ resources: [customers.toModel(), repairs.toModel()], views: [customersView.toModel(), repairsView.toModel()], rows: { customers: customerRows, repairs: repairRows } }))
  const client = refuse
    ? {
        ...api.client,
        update: async () => {
          throw new ApiError({ type: 'urn:problem:validation-failed', title: 'Validation failed', status: 422, errors: [{ field: 'paid', message: refuse }] })
        },
      }
    : api.client
  return (
    <div className="h-screen">
      <App client={client} auth={session} initialUrl={start} ui={ui} workspace="Pip's bike shop" />
    </div>
  )
}

export const Board: StoryObj = { name: 'A board, the default', render: () => <Shop start="/repairs" /> }

const withCustomBoard = workshop.repairsView.list((r, d) => ({
  columns: [r.number],
  displays: [d.custom(component<{ by: string }>('RepairBoard'), { name: 'board', label: 'Board', icon: 'kanban', fields: [r.number, r.bike, r.status], props: { by: r.status } })],
  default: 'board',
}))

export const CustomBoard: StoryObj = { name: 'A board drawn by a component', render: () => <Shop start="/repairs" repairsView={withCustomBoard} /> }

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

const column = (canvas: ReturnType<typeof within>, name: string) => canvas.findByRole('region', { name: new RegExp(`^${name}, \\d+$`) })
const cardNumbers = (region: HTMLElement) => within(region).queryAllByRole('link').map((link) => link.firstElementChild?.firstElementChild?.textContent)

export const BoardChecks: StoryObj = {
  ...Board,
  name: 'A board, the default (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(await pressed(canvas)).toBe('Board')
    // A column per status, in the enum's order, each with its count
    await waitFor(() => expect(canvas.getAllByRole('region').map((region) => region.getAttribute('aria-label'))).toEqual(['booked, 3', 'waiting, 2', 'working, 2', 'ready, 2', 'collected, 5']))
    const ready = await column(canvas, 'ready')
    expect(cardNumbers(ready)).toEqual(['R-305', 'R-311'])
    expect(within(ready).getAllByRole('link')[0]).toHaveTextContent('Brompton C Line')
    expect(within(ready).getAllByRole('link')[0]).toHaveAttribute('href', '/repairs/5')
    await userEvent.click(within(ready).getAllByRole('link')[0]!)
    await canvas.findByRole('heading', { name: 'R-305' })
  },
}

export const BoardWideChecks: StoryObj = {
  ...Board,
  name: 'A board wider than the page (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // Once the last column's cards are in, the board is wider than the page
    const collected = await column(canvas, 'collected')
    await waitFor(() => expect(cardNumbers(collected)).toHaveLength(5))
    const board = collected.parentElement!.parentElement!
    expect(board.scrollWidth).toBeGreaterThan(board.clientWidth)
    // It scrolls sideways in place; the page does not
    const page = document.scrollingElement!
    expect(page.scrollWidth).toBeLessThanOrEqual(page.clientWidth)
  },
}

export const BoardFilteredChecks: StoryObj = {
  name: 'A board, filtered (checks)',
  tags: ['play', '!dev'],
  render: () => <Shop start={`/repairs?filter=${encodeURIComponent('mechanic = "Sem"')}`} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // Every column follows the list's filter
    const ready = await column(canvas, 'ready')
    await waitFor(() => expect(cardNumbers(ready)).toEqual(['R-305']))
    await waitFor(async () => expect((await column(canvas, 'booked')).getAttribute('aria-label')).toBe('booked, 0'))
  },
}

// Space picks the focused card up, the arrow keys move it between columns and Space drops it; each key waits for what
// the board tells a screen reader, so the next one lands once the board listens for it.
const moveByKeyboard = async (card: HTMLElement, steps: string, to: string) => {
  const announced = (text: string) => waitFor(() => expect(within(document.body).getByText(text, { exact: false, ignore: 'a, a *' })).toBeInTheDocument())
  card.focus()
  await userEvent.keyboard(' ')
  await announced('is over ')
  await userEvent.keyboard(steps)
  await announced(`is over ${to}.`)
  await userEvent.keyboard(' ')
}

export const BoardMoveChecks: StoryObj = {
  ...Board,
  name: 'A board, a card moved with the keyboard (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const ready = await column(canvas, 'ready')
    await waitFor(() => expect(cardNumbers(ready)).toEqual(['R-305', 'R-311']))
    await moveByKeyboard(within(ready).getAllByRole('link')[0]!, '{ArrowRight}', 'collected')
    const collected = await column(canvas, 'collected')
    await waitFor(() => expect(cardNumbers(collected)).toContain('R-305'))
    await waitFor(() => expect(cardNumbers(ready)).toEqual(['R-311']))
    expect(collected).toHaveAccessibleName('collected, 6')
    expect(ready).toHaveAccessibleName('ready, 1')
    // Saved: the repair's page says so
    await userEvent.click(within(collected).getByRole('link', { name: /R-305/ }))
    await canvas.findByRole('heading', { name: 'R-305' })
    expect(await canvas.findAllByText('collected')).not.toHaveLength(0)
  },
}

export const BoardRefusedChecks: StoryObj = {
  name: 'A board, a move the server refuses (checks)',
  tags: ['play', '!dev'],
  render: () => <Shop start="/repairs" refuse="A bike leaves the shop paid" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const ready = await column(canvas, 'ready')
    await waitFor(() => expect(cardNumbers(ready)).toEqual(['R-305', 'R-311']))
    await moveByKeyboard(within(ready).getAllByRole('link')[0]!, '{ArrowRight}', 'collected')
    // Put back, with the reason
    expect(await within(document.body).findByText('A bike leaves the shop paid')).toBeInTheDocument()
    expect(within(document.body).getByText('Could not move it to collected')).toBeInTheDocument()
    await waitFor(() => expect(cardNumbers(ready)).toEqual(['R-305', 'R-311']))
    expect(cardNumbers(await column(canvas, 'collected'))).not.toContain('R-305')
  },
}

export const Calendar: StoryObj = { name: 'A calendar', render: () => <Shop start="/repairs?display=calendar&calendar=month,2026-10-01" /> }

export const CalendarWeek: StoryObj = { name: 'A calendar, a week', render: () => <Shop start="/repairs?display=calendar&calendar=week,2026-10-05" /> }

// A day of the calendar, by its date as the toasts and announcements write it
const day = (canvas: ReturnType<typeof within>, date: string) => canvas.findByRole('region', { name: new RegExp(`, ${date}, \\d+$`) })
const eventNumbers = (region: HTMLElement) => within(region).queryAllByRole('link').map((link) => link.textContent)

export const CalendarChecks: StoryObj = {
  ...Calendar,
  name: 'A calendar (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(await pressed(canvas)).toBe('Calendar')
    expect(await canvas.findByRole('heading', { name: 'October 2026' })).toBeInTheDocument()
    // Whole weeks, from Monday 28 September to Sunday 1 November
    await waitFor(() => expect(canvas.getAllByRole('region')).toHaveLength(35))
    const seventh = await day(canvas, '7 Oct 2026')
    await waitFor(() => expect(eventNumbers(seventh)).toEqual(['R-301', 'R-302']))
    expect(within(seventh).getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual(['/repairs/1', '/repairs/2'])
    // Only the days shown are loaded: September's repairs are not on the calendar
    expect(canvas.queryByRole('link', { name: 'R-307' })).toBeNull()
    // A calendar has a fixed order
    expect(canvas.queryByRole('combobox', { name: 'Sort' })).toBeNull()
    expect(canvas.getByRole('link', { name: 'Next month' })).toHaveAttribute('href', '/repairs?display=calendar&calendar=month%2C2026-11-01')
    expect(canvas.getByRole('link', { name: 'Month' })).toHaveAttribute('aria-current', 'page')
    await userEvent.click(within(seventh).getByRole('link', { name: 'R-301' }))
    await canvas.findByRole('heading', { name: 'R-301' })
  },
}

export const CalendarWeekChecks: StoryObj = {
  ...CalendarWeek,
  name: 'A calendar, a week (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(await canvas.findByRole('heading', { name: /^5\s?–\s?11 Oct 2026$/ })).toBeInTheDocument()
    await waitFor(() => expect(canvas.getAllByRole('region')).toHaveLength(7))
    await waitFor(async () => expect(eventNumbers(await day(canvas, '6 Oct 2026'))).toEqual(['R-303', 'R-306']))
    expect(eventNumbers(await day(canvas, '5 Oct 2026'))).toEqual(['R-305'])
    expect(eventNumbers(await day(canvas, '8 Oct 2026'))).toEqual(['R-312'])
    expect(eventNumbers(await day(canvas, '11 Oct 2026'))).toEqual([])
    // The week before holds 4 October
    await userEvent.click(canvas.getByRole('link', { name: 'Previous week' }))
    await waitFor(async () => expect(eventNumbers(await day(canvas, '4 Oct 2026'))).toEqual(['R-311']))
  },
}

export const CalendarFilteredChecks: StoryObj = {
  name: 'A calendar, filtered (checks)',
  tags: ['play', '!dev'],
  render: () => <Shop start={`/repairs?display=calendar&calendar=month,2026-10-01&filter=${encodeURIComponent('mechanic = "Sem"')}`} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(async () => expect(eventNumbers(await day(canvas, '6 Oct 2026'))).toEqual(['R-303']))
    expect(eventNumbers(await day(canvas, '1 Oct 2026'))).toEqual(['R-314'])
    expect(eventNumbers(await day(canvas, '7 Oct 2026'))).toEqual([])
  },
}

export const CalendarMoveChecks: StoryObj = {
  ...Calendar,
  name: 'A calendar, an event moved with the keyboard (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const eighth = await day(canvas, '8 Oct 2026')
    await waitFor(() => expect(eventNumbers(eighth)).toEqual(['R-312']))
    await moveByKeyboard(within(eighth).getByRole('link', { name: 'R-312' }), '{ArrowRight}', '9 Oct 2026')
    const ninth = await day(canvas, '9 Oct 2026')
    await waitFor(() => expect(eventNumbers(ninth)).toEqual(['R-312']))
    await waitFor(() => expect(eventNumbers(eighth)).toEqual([]))
    // Saved: the repair's page says so
    await userEvent.click(within(ninth).getByRole('link', { name: 'R-312' }))
    await canvas.findByRole('heading', { name: 'R-312' })
    expect(await canvas.findAllByText('9 Oct 2026')).not.toHaveLength(0)
  },
}

export const CalendarRefusedChecks: StoryObj = {
  name: 'A calendar, a move the server refuses (checks)',
  tags: ['play', '!dev'],
  render: () => <Shop start="/repairs?display=calendar&calendar=month,2026-10-01" refuse="The workshop is closed that day" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const eighth = await day(canvas, '8 Oct 2026')
    await waitFor(() => expect(eventNumbers(eighth)).toEqual(['R-312']))
    await moveByKeyboard(within(eighth).getByRole('link', { name: 'R-312' }), '{ArrowRight}', '9 Oct 2026')
    // Put back, with the reason
    expect(await within(document.body).findByText('The workshop is closed that day')).toBeInTheDocument()
    expect(within(document.body).getByText('Could not move it to 9 Oct 2026')).toBeInTheDocument()
    await waitFor(() => expect(eventNumbers(eighth)).toEqual(['R-312']))
    expect(eventNumbers(await day(canvas, '9 Oct 2026'))).toEqual([])
  },
}

export const CustomBoardChecks: StoryObj = {
  ...CustomBoard,
  name: 'A board drawn by a component (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const ready = await canvas.findByRole('region', { name: 'ready' })
    await waitFor(() => expect(within(ready).getAllByRole('link').map((link) => link.textContent)).toEqual(['R-305Brompton C Line', 'R-311Cannondale Topstone']))
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

const phone360 = { name: 'Phone 360', styles: { width: '360px', height: '740px' }, type: 'mobile' }
const box = (element: Element) => element.getBoundingClientRect()
const middle = (element: Element) => (box(element).top + box(element).bottom) / 2

/** On a phone the display switch is a menu beside the title, the filters button sits left of the search, and the sort is in the filters sheet. */
export const CardsOnPhoneChecks: StoryObj = {
  name: 'Cards on a phone (checks)',
  tags: ['play', 'phone', '!dev'],
  parameters: { viewport: { options: { phone360 } } },
  globals: { viewport: { value: 'phone360' } },
  render: () => <Shop start="/repairs?display=cards" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const heading = await canvas.findByRole('heading', { name: 'Repairs' })
    const display = canvas.getByRole('button', { name: 'Display: Cards' })
    expect(box(display).left).toBeGreaterThan(box(heading).right)
    expect(Math.abs(middle(display) - middle(heading))).toBeLessThan(2)
    expect(canvas.queryByRole('group', { name: 'Display' })).toBeNull()
    const filters = canvas.getByRole('button', { name: 'Filters' })
    const search = canvas.getByRole('textbox', { name: 'Search' })
    expect(box(filters).right).toBeLessThanOrEqual(box(search).left)
    expect(Math.abs(middle(filters) - middle(search))).toBeLessThan(2)
    expect(canvas.queryByRole('combobox', { name: 'Sort' })).toBeNull()

    await userEvent.click(filters)
    const sheet = await canvas.findByRole('dialog', { name: 'Filters' })
    await userEvent.selectOptions(within(sheet).getByRole('combobox', { name: 'Sort' }), 'booked_on asc')
    await waitFor(async () => expect((await cardTitles(canvas))[0]).toBe('Gazelle Orange'))
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(canvas.queryByRole('dialog', { name: 'Filters' })).toBeNull())

    await userEvent.click(display)
    const menu = canvas.getByRole('menu', { name: 'Display' })
    expect(within(menu).getAllByRole('menuitemradio').map((item) => item.textContent)).toEqual(['Table', 'Cards', 'Board', 'Calendar'])
    expect(within(menu).getByRole('menuitemradio', { name: 'Cards' })).toHaveAttribute('aria-checked', 'true')
    expect(within(menu).getByRole('menuitemradio', { name: 'Cards' })).toHaveFocus()
    await userEvent.keyboard('{ArrowUp}')
    expect(within(menu).getByRole('menuitemradio', { name: 'Table' })).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    await canvas.findByText('14 rows')
    expect(canvas.queryByRole('menu')).toBeNull()
    expect(canvas.getByRole('button', { name: 'Display: Table' })).toHaveFocus()
  },
}

/** On a phone, a list without a cards display opens in a row per record: a link with its title and status badge, the table a pick away. */
export const RowsOnPhoneChecks: StoryObj = {
  name: 'A list without cards on a phone (checks)',
  tags: ['play', 'phone', '!dev'],
  parameters: { viewport: { options: { phone360 } } },
  globals: { viewport: { value: 'phone360' } },
  render: () => <Shop start="/repairs" repairsView={tableOnlyRepairsView} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const list = await canvas.findByRole('list', { name: 'Repairs' })
    const first = await waitFor(() => within(list).getAllByRole('link')[0]!)
    // Booked on, newest first
    expect(first.getAttribute('href')).toMatch(/\/repairs\/12$/)
    expect(first).toHaveTextContent('R-312')
    expect(first).toHaveTextContent(enumLabel('booked'))
    expect(first).toHaveTextContent('VanMoof S5')
    expect(canvas.queryByRole('grid')).toBeNull()

    await userEvent.click(canvas.getByRole('button', { name: 'Display: List' }))
    const menu = canvas.getByRole('menu', { name: 'Display' })
    expect(within(menu).getAllByRole('menuitemradio').map((item) => item.textContent)).toEqual(['Table', 'List'])
    await userEvent.click(within(menu).getByRole('menuitemradio', { name: 'Table' }))
    expect(await canvas.findByRole('grid')).toBeVisible()
    expect(canvas.queryByRole('list', { name: 'Repairs' })).toBeNull()
  },
}
