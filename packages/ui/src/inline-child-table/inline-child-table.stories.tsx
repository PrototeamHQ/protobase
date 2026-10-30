import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { InlineChildTable, NumberCell, type LineColumn } from './index'

type Line = { id: string; description: string; quantity: number }

const sampleLines: Line[] = [
  { id: 'l1', description: 'Line A', quantity: 1 },
  { id: 'l2', description: 'Line B', quantity: 2 },
  { id: 'l3', description: 'Line C', quantity: 3 },
]

const columns = (onChange?: (id: string, patch: Partial<Line>) => void): LineColumn<Line>[] => [
  { key: 'description', label: 'Description', cell: (line) => <span className="truncate px-2 text-foreground">{line.description}</span> },
  {
    key: 'quantity',
    label: 'Quantity',
    align: 'right',
    width: '88px',
    cell: (line) =>
      onChange ? (
        <NumberCell label="Quantity" value={line.quantity} format={String} parse={(typed) => Math.round(Number(typed))} onCommit={(quantity) => onChange(line.id, { quantity })} />
      ) : (
        <span className="px-2 tabular-nums">{line.quantity}</span>
      ),
  },
]

type Args = { lines: Line[]; editable: boolean; reorderable: boolean; failing?: string; onReorder: (lines: Line[], move: { id: string; from: number; to: number }) => void }

const Table = ({ lines: initial, editable, reorderable, failing, onReorder }: Args) => {
  const [lines, setLines] = useState(initial)
  return (
    <div className="w-[760px]">
      <InlineChildTable
        lines={lines}
        columns={columns(editable ? (id, patch) => setLines(lines.map((line) => (line.id === id ? { ...line, ...patch } : line))) : undefined)}
        lineName={(line) => line.description}
        reorderable={reorderable}
        onReorder={(next, move) => {
          onReorder(next, move)
          setLines(next)
        }}
        onAdd={editable ? () => setLines([...lines, { id: `new-${lines.length}`, description: 'New line', quantity: 1 }]) : undefined}
        onRemove={editable ? (removed) => setLines(lines.filter((line) => line.id !== removed.id)) : undefined}
        lineError={(line) => (line.id === failing ? 'Quantity must be at least 1.' : undefined)}
      />
    </div>
  )
}

const meta = {
  title: 'Components/InlineChildTable',
  component: Table,
  parameters: { layout: 'padded' },
  args: { lines: sampleLines, editable: true, reorderable: true, onReorder: fn() },
} satisfies Meta<typeof Table>
export default meta
type Story = StoryObj<typeof meta>

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export const Editable: Story = {}
export const ReadOnly: Story = { args: { editable: false, reorderable: false } }

/** Fields are fixed, but the lines can still be reordered. */
export const ReorderOnly: Story = { args: { editable: false } }

/** A line the server turned down says why under its cells. */
export const LineError: Story = { args: { failing: 'l2' } }

export const AddAndRemove: Story = {
  tags: ['play'],
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Add line' }))
    await waitFor(() => expect(canvasElement.querySelectorAll('[data-line-id]')).toHaveLength(args.lines.length + 1))
    await userEvent.click(canvas.getByRole('button', { name: 'Actions for New line' }))
    await userEvent.click(canvas.getByRole('menuitem', { name: 'Remove line' }))
    await waitFor(() => expect(canvasElement.querySelectorAll('[data-line-id]')).toHaveLength(args.lines.length))
  },
}

export const KeyboardReorder: Story = {
  tags: ['play'],
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const [first, second] = args.lines
    const handle = canvas.getByRole('button', { name: `Drag to reorder ${first!.description}` })
    handle.focus()
    // dnd-kit starts listening for the arrow keys a moment after the pick-up
    await userEvent.keyboard(' ')
    await pause(150)
    await userEvent.keyboard('{ArrowDown}')
    await pause(150)
    await userEvent.keyboard(' ')
    await waitFor(() => expect(args.onReorder).toHaveBeenCalledTimes(1))
    expect(args.onReorder).toHaveBeenCalledWith(expect.anything(), { id: first!.id, from: 0, to: 1 })
    const rows = canvasElement.querySelectorAll('[data-line-id]')
    expect(rows[0]?.getAttribute('data-line-id')).toBe(second!.id)
    expect(rows[1]?.getAttribute('data-line-id')).toBe(first!.id)
  },
}

export const MenuMoveDown: Story = {
  tags: ['play'],
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const [first] = args.lines
    await userEvent.click(canvas.getByRole('button', { name: `Actions for ${first!.description}` }))
    expect(canvas.getByRole('menuitem', { name: 'Move up' })).toBeDisabled()
    await userEvent.click(canvas.getByRole('menuitem', { name: 'Move down' }))
    await waitFor(() => expect(args.onReorder).toHaveBeenCalledWith(expect.anything(), { id: first!.id, from: 0, to: 1 }))
  },
}
