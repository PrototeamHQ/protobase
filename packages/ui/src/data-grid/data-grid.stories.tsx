import type { Meta, StoryObj } from '@storybook/react-vite'
import { orderAt, orderCount, stockMoveAt, stockMoveCount } from '../mocks'
import { DataGrid } from './data-grid'
import { ordersColumns, ordersColumnsWithDiscount, ordersNaturalSort } from './orders-columns'
import { createRowSource } from './row-source'
import { stockMoveColumns, stockMovesNaturalSort } from './stock-move-columns'

const orders = createRowSource(orderCount, orderAt)
const stockMoves = createRowSource(stockMoveCount, stockMoveAt)

const meta = {
  title: 'Components/DataGrid',
  component: DataGrid,
  parameters: { layout: 'fullscreen' },
  decorators: [(Story) => <div className="flex h-screen flex-col p-4"><Story /></div>],
  args: { columns: ordersColumns, source: orders, naturalSort: ordersNaturalSort, latencyMs: 0 },
} satisfies Meta<typeof DataGrid>

export default meta
type Story = StoryObj<typeof meta>

export const Orders: Story = {}

export const Compact: Story = { args: { compact: true } }

export const WithNewColumn: Story = { args: { columns: ordersColumnsWithDiscount(true) } }

export const TenMillionRows: Story = {
  args: { columns: stockMoveColumns, source: stockMoves, naturalSort: stockMovesNaturalSort, initialScrollIndex: 6_482_300, latencyMs: 150 },
}

export const PinnedColumn: Story = { args: { defaultPinned: ['number'] }, decorators: [(Story) => <div className="flex h-screen w-[700px] flex-col p-4"><Story /></div>] }

export const SlowLoading: Story = { args: { latencyMs: 1500 } }
