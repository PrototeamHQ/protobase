import type { Meta, StoryObj } from '@storybook/react-vite'
import { FilterPanel } from './filter-panel'
import { ordersFilters } from './orders-filters'
import { stockMoveFilters } from './stock-move-filters'

const activeOrders = {
  facets: { status: ['shipped', 'picking'], country: ['NL'] },
  range: [500, 2500] as [number, number],
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
