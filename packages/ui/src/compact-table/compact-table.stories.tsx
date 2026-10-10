import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { CompactTable } from './compact-table'

const rows = [
  ['INV-0042', 'Acme BV', '1250.00', '2026-09-30'],
  ['INV-0039', 'Brightside', '980.50', null],
  ['INV-0037', 'Acme BV', '640.00', '2026-09-12'],
  ['INV-0031', 'Northwind', '410.25', null],
]

const meta = {
  title: 'Components/CompactTable',
  component: CompactTable,
  parameters: { layout: 'centered' },
  args: { columns: ['number', 'customer', 'total', 'paid_at'], rows, caption: 'select number, customer, total, paid_at from sales.invoices order by total desc limit 4' },
  decorators: [(Story) => <div className="w-[348px]"><Story /></div>],
} satisfies Meta<typeof CompactTable>

export default meta
type Story = StoryObj<typeof meta>

export const Rows: Story = {
  tags: ['play'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(canvas.getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual(['number', 'customer', 'total', 'paid_at'])
    expect(canvas.getAllByRole('row')).toHaveLength(5)
    expect(canvas.getAllByText('null')).toHaveLength(2)
  },
}
export const Truncated: Story = { args: { truncated: true } }
export const NoRows: Story = { args: { rows: [] } }
export const WithoutCaption: Story = { args: { caption: undefined } }
