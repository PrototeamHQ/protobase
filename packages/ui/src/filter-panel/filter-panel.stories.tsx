import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fireEvent, userEvent, within } from 'storybook/test'
import { FilterPanel } from './filter-panel'
import { listingFilters } from './listing-filters'
import { ordersFilters } from './orders-filters'
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
    fireEvent.change(canvas.getByRole('slider', { name: 'Bedrooms minimum' }), { target: { value: '2' } })
    expect(chipLabels(canvasElement)).toEqual(['Remove Bedrooms: 2 – 6'])
  },
}

export const BarWithOpenCombobox: Story = {
  args: { config: listingFilters, layout: 'bar', defaultOpenMenu: 'place_id', defaultValue: { facets: { place_id: ['7', '23'] }, toggles: [] } },
  parameters: { layout: 'padded' },
  decorators: [(Story) => <div className="h-96 w-[900px]"><Story /></div>],
}
