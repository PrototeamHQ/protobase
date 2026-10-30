import { arrayMove } from '@dnd-kit/sortable'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { orderAt } from '../mocks'
import { DataGrid } from './data-grid'
import { ordersColumns } from './orders-fixtures'

const Orders = ({ onOpenRow }: { onOpenRow: () => void }) => {
  const [rows, setRows] = useState(() => Array.from({ length: 6 }, (_, index) => orderAt(index)))
  return (
    <div className="flex flex-col p-4">
      <DataGrid
        fit
        scroll="parent"
        columns={ordersColumns.map((spec) => ({ ...spec, sortable: false }))}
        source={{ total: rows.length, rowAt: (index) => rows[index]! }}
        latencyMs={0}
        onOpenRow={onOpenRow}
        rowNumbers={false}
        reorder={{ label: (row) => String(row.number), onMove: (from, to) => setRows((current) => arrayMove(current, from, to)) }}
      />
    </div>
  )
}

const meta = {
  title: 'Components/DataGrid/Rows moved by hand',
  component: Orders,
  parameters: { layout: 'fullscreen' },
  args: { onOpenRow: fn() },
} satisfies Meta<typeof Orders>

export default meta
type Story = StoryObj<typeof meta>

/** A drag handle in each row's checkbox place. */
export const Handles: Story = {}

const numbers = (grid: HTMLElement) => within(grid).getAllByRole('button', { name: /^Move / }).map((handle) => handle.getAttribute('aria-label')!.slice('Move '.length))

/** Space on a handle picks the row up, the arrow keys move it, and Space drops it there; the handle opens nothing. */
export const KeyboardChecks: Story = {
  ...Handles,
  name: 'Handles (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement, args }) => {
    const grid = within(canvasElement).getByRole('grid')
    expect(within(grid).queryByRole('checkbox')).toBeNull()
    const [first, second] = numbers(grid)
    const handle = within(grid).getByRole('button', { name: `Move ${first}` })
    handle.focus()
    await userEvent.keyboard(' ')
    // Picking it up puts it over its own row, which a screen reader is told next
    await waitFor(() => expect(canvasElement.ownerDocument.body).toHaveTextContent(`${first} is over row 1 of 6.`))
    await userEvent.keyboard('{ArrowDown}')
    await waitFor(() => expect(canvasElement.ownerDocument.body).toHaveTextContent(`${first} is over row 2 of 6.`))
    await userEvent.keyboard(' ')
    await waitFor(() => expect(numbers(grid).slice(0, 2)).toEqual([second, first]))
    await userEvent.click(within(grid).getByRole('button', { name: `Move ${first}` }))
    expect(args.onOpenRow).not.toHaveBeenCalled()
  },
}
