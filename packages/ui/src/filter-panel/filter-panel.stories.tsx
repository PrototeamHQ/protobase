import type { ReactNode } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fireEvent, userEvent, waitFor, within } from 'storybook/test'
import { FilterPanel } from './filter-panel'
import { listingFilters } from './listing-filters'
import { ordersFilters } from './orders-filters'
import { rangeSettleMs } from './range-filter'
import { stockMoveFilters } from './stock-move-filters'

const activeOrders = {
  facets: { status: ['shipped', 'picking'], country: ['NL'] },
  ranges: { total: [500, 2500] as [number, number] },
  date: '30d' as const,
  toggles: ['unpaid'],
}

const meta = {
  title: 'Components/FilterPanel',
  component: FilterPanel,
  args: { config: ordersFilters, layout: 'panel' },
} satisfies Meta<typeof FilterPanel>

export default meta
type Story = StoryObj<typeof meta>

export const Panel: Story = {}

export const PanelWithActiveFilters: Story = { args: { defaultValue: activeOrders } }

export const Bar: Story = { args: { layout: 'bar' }, parameters: { layout: 'padded' } }

export const BarWithActiveFilters: Story = { args: { layout: 'bar', defaultValue: activeOrders }, parameters: { layout: 'padded' } }

export const BarWithOpenMenu: Story = { args: { layout: 'bar', defaultOpenMenu: 'status' }, parameters: { layout: 'padded' }, decorators: [(Story) => <div className="h-96 w-[900px]"><Story /></div>] }

export const LockedChip: Story = { args: { layout: 'bar', lockedLabels: ['Showing your orders only'] }, parameters: { layout: 'padded' } }

export const StockMoves: Story = { args: { config: stockMoveFilters, defaultValue: { facets: { kind: ['issue'] }, toggles: [] } } }

/** React renders an event's update after the event, as a browser does between a slider's input and its release. */
const nextTask = () => new Promise((resolve) => setTimeout(resolve))

const chipLabels = (root: HTMLElement) => within(root).queryAllByRole('button', { name: /^Remove .+: / }).map((button) => button.getAttribute('aria-label'))

/** A reference is a combobox: typing narrows the options, a click, or the arrow keys and Enter, choose several, Backspace takes the last off. */
export const ReferenceCombobox: Story = {
  args: { config: listingFilters },
  tags: ['play'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const box = canvas.getByRole('combobox', { name: 'Place' })
    await userEvent.click(box)
    await userEvent.type(box, 'ha')
    const list = canvas.getByRole('listbox', { name: 'Place' })
    expect(within(list).getAllByRole('option').map((option) => option.textContent)).toEqual(['Den Haag21', 'Haarlem14'])
    await userEvent.click(within(list).getByRole('option', { name: /^Haarlem/ }))
    expect(box).toHaveFocus()
    await userEvent.keyboard('{ArrowDown}{Enter}')
    expect(chipLabels(canvasElement)).toEqual(['Remove Place: Haarlem', 'Remove Place: Den Haag'])
    expect(within(list).getByRole('option', { name: /^Den Haag/ })).toHaveAttribute('aria-selected', 'true')
    await userEvent.keyboard('{Escape}')
    expect(box).toHaveValue('')
    await userEvent.keyboard('{Backspace}')
    expect(chipLabels(canvasElement)).toEqual(['Remove Place: Haarlem'])
    await userEvent.click(canvas.getByRole('button', { name: 'Remove Haarlem' }))
    expect(chipLabels(canvasElement)).toEqual([])
  },
}

/** Every range has its own slider, and one moved leaves the others unfiltered. */
export const SeveralRanges: Story = {
  args: { config: listingFilters },
  tags: ['play'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(canvas.getAllByRole('slider').map((slider) => slider.getAttribute('aria-label'))).toEqual([
      'Price minimum', 'Price maximum', 'Living area (m²) minimum', 'Living area (m²) maximum', 'Bedrooms minimum', 'Bedrooms maximum',
    ])
    const bedrooms = canvas.getByRole('slider', { name: 'Bedrooms minimum' })
    fireEvent.change(bedrooms, { target: { value: '2' } })
    await nextTask()
    fireEvent.pointerUp(bedrooms)
    await nextTask()
    expect(chipLabels(canvasElement)).toEqual(['Remove Bedrooms: 2 – 6'])
  },
}

/** A dragged thumb and its label move at once, but the list filters only when it is let go of, or rests a second. */
export const RangeAppliesOnRelease: Story = {
  args: { config: listingFilters },
  tags: ['play'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const bedrooms = canvas.getByRole('slider', { name: 'Bedrooms minimum' })
    fireEvent.pointerDown(bedrooms)
    fireEvent.change(bedrooms, { target: { value: '2' } })
    await nextTask()
    fireEvent.change(bedrooms, { target: { value: '3' } })
    await nextTask()
    expect(bedrooms).toHaveValue('3')
    expect(chipLabels(canvasElement)).toEqual([])
    fireEvent.pointerUp(bedrooms)
    await nextTask()
    expect(chipLabels(canvasElement)).toEqual(['Remove Bedrooms: 3 – 6'])

    const living = canvas.getByRole('slider', { name: 'Living area (m²) minimum' })
    fireEvent.pointerDown(living)
    fireEvent.change(living, { target: { value: '99' } })
    await nextTask()
    expect(chipLabels(canvasElement)).toEqual(['Remove Bedrooms: 3 – 6'])
    await waitFor(() => expect(chipLabels(canvasElement)).toHaveLength(2), { timeout: rangeSettleMs * 2 })
    fireEvent.pointerUp(living)

    const maximum = canvas.getByRole('slider', { name: 'Bedrooms maximum' })
    // An arrow key moves a slider by its browser's default action, which a synthetic key press does not run
    maximum.focus()
    fireEvent.keyDown(maximum, { key: 'ArrowLeft' })
    fireEvent.change(maximum, { target: { value: '5' } })
    fireEvent.keyUp(maximum, { key: 'ArrowLeft' })
    await nextTask()
    expect(chipLabels(canvasElement)).toHaveLength(2)
    await waitFor(() => expect(chipLabels(canvasElement)).toContain('Remove Bedrooms: 3 – 5'), { timeout: rangeSettleMs * 2 })
  },
}

export const BarWithOpenCombobox: Story = {
  args: { config: listingFilters, layout: 'bar', defaultOpenMenu: 'place_id', defaultValue: { facets: { place_id: ['7', '23'] }, toggles: [] } },
  parameters: { layout: 'padded' },
  decorators: [(Story) => <div className="h-96 w-[900px]"><Story /></div>],
}

const secondaryOrders = {
  ...ordersFilters,
  facets: ordersFilters.facets.map((group) => (group.id === 'status' ? group : { ...group, secondary: true })),
}
const barCanvas = [(Story: () => ReactNode) => <div className="h-96 w-[900px]"><Story /></div>]

export const BarWithMoreFilters: Story = {
  tags: ['play'],
  args: { config: secondaryOrders, layout: 'bar' },
  parameters: { layout: 'padded' },
  decorators: barCanvas,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(canvas.queryByRole('button', { name: /^Country/ })).toBeNull()
    await userEvent.click(canvas.getByRole('button', { name: /More filters/ }))
    const items = canvas.getAllByRole('menuitem')
    await waitFor(() => expect(items[0]).toHaveFocus())
    await userEvent.keyboard('{ArrowDown}')
    expect(items[1]).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    expect(canvas.queryByRole('menu')).toBeNull()

    await userEvent.click(canvas.getByRole('button', { name: /More filters/ }))
    await userEvent.click(canvas.getByRole('menuitem', { name: 'Country' }))
    expect(canvas.queryByRole('menu', { name: 'More filters' })).toBeNull()
    expect(canvas.getByRole('button', { name: /^Country/ })).toHaveAttribute('aria-expanded', 'true')

    await userEvent.click(canvas.getByRole('button', { name: /More filters/ }))
    expect(canvas.queryByRole('menuitem', { name: 'Country' })).toBeNull()
    await userEvent.click(canvas.getByRole('menuitem', { name: 'Owner' }))
    expect(canvas.queryByRole('button', { name: /More filters/ })).toBeNull()
  },
}

export const BarWithActiveSecondaryFilter: Story = {
  tags: ['play'],
  args: { config: secondaryOrders, layout: 'bar', defaultValue: { facets: { country: ['NL'] }, toggles: [] } },
  parameters: { layout: 'padded' },
  decorators: barCanvas,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(canvas.getByRole('button', { name: /^Country/ })).toBeInTheDocument()
    await userEvent.click(canvas.getByRole('button', { name: /More filters/ }))
    expect(canvas.queryByRole('menuitem', { name: 'Country' })).toBeNull()
    await userEvent.keyboard('{Escape}')

    await userEvent.click(canvas.getByRole('button', { name: /^Remove Country/ }))
    expect(canvas.getByRole('button', { name: /^Country/ })).toBeInTheDocument()
    await userEvent.click(canvas.getByRole('button', { name: /More filters/ }))
    expect(canvas.queryByRole('menuitem', { name: 'Country' })).toBeNull()
  },
}
