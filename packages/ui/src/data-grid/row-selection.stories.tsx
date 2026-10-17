import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { orderAt } from '../mocks'
import { DataGrid } from './data-grid'
import { ordersColumns, ordersNaturalSort } from './orders-columns'
import { createRowSource } from './row-source'

const meta = {
  title: 'Components/DataGrid/Row selection',
  component: DataGrid,
  parameters: { layout: 'fullscreen' },
  decorators: [(Story) => <div className="flex h-screen flex-col p-4"><Story /></div>],
  args: { columns: ordersColumns, source: createRowSource(3, orderAt), naturalSort: ordersNaturalSort, latencyMs: 0, onOpenRow: fn() },
} satisfies Meta<typeof DataGrid>

export default meta
type Story = StoryObj<typeof meta>

/** A click on the selection cell's padding, away from the checkbox, toggles the row and does not open it. */
export const CellPaddingToggles: Story = {
  tags: ['play'],
  play: async ({ canvasElement, args }) => {
    const grid = within(canvasElement).getByRole('grid')
    const checkbox = await within(grid).findByRole('checkbox', { name: 'Select row 1' })
    const cell = checkbox.parentElement!
    const box = cell.getBoundingClientRect()
    const target = { target: cell, coords: { clientX: box.right - 2, clientY: box.bottom - 2 } }
    await userEvent.pointer({ keys: '[MouseLeft]', ...target })
    await waitFor(() => expect(checkbox).toHaveAttribute('aria-checked', 'true'))
    await userEvent.click(checkbox)
    await waitFor(() => expect(checkbox).toHaveAttribute('aria-checked', 'false'))
    expect(args.onOpenRow).not.toHaveBeenCalled()
  },
}
