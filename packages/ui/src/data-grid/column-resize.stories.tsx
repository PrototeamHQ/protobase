import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, waitFor, within } from 'storybook/test'
import { orderAt } from '../mocks'
import { minColumnWidth } from './column-resize'
import { DataGrid } from './data-grid'
import { ordersColumns, ordersNaturalSort } from './orders-fixtures'
import { createRowSource } from './row-source'

const meta = {
  title: 'Components/DataGrid/Column resize',
  component: DataGrid,
  parameters: { layout: 'fullscreen' },
  decorators: [(Story) => <div className="flex h-screen flex-col p-4"><Story /></div>],
  args: { columns: ordersColumns, source: createRowSource(5, orderAt), naturalSort: ordersNaturalSort, latencyMs: 0, onSortChange: fn() },
} satisfies Meta<typeof DataGrid>

export default meta
type Story = StoryObj<typeof meta>

const headerCell = (grid: HTMLElement, id: string) => grid.querySelector<HTMLElement>(`[role=row] [data-col-id="${id}"]`)!

/** Drags `header`'s edge `delta` pixels sideways, letting go over the column's own header, as a browser sends it. */
const drag = (grid: HTMLElement, header: string, delta: number) => {
  const handle = within(grid).getByRole('separator', { name: `Resize ${header} column` })
  const box = handle.getBoundingClientRect()
  const x = box.left + box.width / 2
  const y = box.top + box.height / 2
  handle.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y }))
  window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: x + delta, clientY: y }))
  window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: x + delta, clientY: y }))
  handle.click()
}

const ready = async (canvasElement: HTMLElement) => {
  const grid = within(canvasElement).getByRole('grid')
  await waitFor(() => expect(within(grid).getAllByRole('row').filter((row) => !row.hasAttribute('aria-busy')).length).toBe(6))
  return grid
}

const widths = (grid: HTMLElement) => Object.fromEntries(ordersColumns.map((spec) => [spec.id, headerCell(grid, spec.id).offsetWidth]))

/** Dragging a header's edge resizes that column, its cells with it, and leaves the others as they were, without sorting. */
export const DragToResize: Story = {
  tags: ['play'],
  play: async ({ canvasElement, args }) => {
    const grid = await ready(canvasElement)
    const before = widths(grid)
    drag(grid, 'Customer', 80)
    await waitFor(() => expect(headerCell(grid, 'customer').offsetWidth).toBe(before.customer! + 80))
    const after = widths(grid)
    for (const spec of ordersColumns) if (spec.id !== 'customer') expect(`${spec.id} ${after[spec.id]}`).toBe(`${spec.id} ${before[spec.id]}`)
    const cell = grid.querySelectorAll<HTMLElement>('[role=row]')[1]!.children[2] as HTMLElement
    expect(cell.offsetWidth).toBe(before.customer! + 80)
    expect(args.onSortChange).not.toHaveBeenCalled()
  },
}

/** A drag far past the column's left edge stops at the minimum width. */
export const StopsAtMinimum: Story = {
  tags: ['play'],
  play: async ({ canvasElement }) => {
    const grid = await ready(canvasElement)
    drag(grid, 'Created', -1000)
    await waitFor(() => expect(headerCell(grid, 'createdAt').offsetWidth).toBe(minColumnWidth))
  },
}

/** Clicking a header still sorts by it after a resize. */
export const SortsAfterResize: Story = {
  tags: ['play'],
  play: async ({ canvasElement, args }) => {
    const grid = await ready(canvasElement)
    drag(grid, 'Total', 40)
    within(headerCell(grid, 'totalCents')).getByRole('button', { name: 'Total' }).click()
    await waitFor(() => expect(args.onSortChange).toHaveBeenCalledWith(expect.objectContaining({ columnId: 'totalCents' })))
  },
}
