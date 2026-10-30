import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { invoiceAt, type InvoiceLine } from '../mocks'
import { invoiceLineColumns } from '../record-view/invoice-line-columns'
import { InlineChildTable, TotalsFooter } from './index'

type Args = { lines: InvoiceLine[]; editable: boolean; reorderable: boolean; failing?: string; onReorder: (lines: InvoiceLine[], move: { id: string; from: number; to: number }) => void }

const Table = ({ lines: initial, editable, reorderable, failing, onReorder }: Args) => {
  const [lines, setLines] = useState(initial)
  return (
    <div className="w-[760px]">
      <InlineChildTable
        lines={lines}
        columns={invoiceLineColumns(editable ? (id, patch) => setLines(lines.map((line) => (line.id === id ? { ...line, ...patch } : line))) : undefined)}
        lineName={(line) => line.description}
        reorderable={reorderable}
        onReorder={(next, move) => {
          onReorder(next, move)
          setLines(next)
        }}
        onAdd={editable ? () => setLines([...lines, { id: `new-${lines.length}`, productId: '', description: 'New line', quantity: 1, unitPriceCents: 0 }]) : undefined}
        onRemove={editable ? (removed) => setLines(lines.filter((line) => line.id !== removed.id)) : undefined}
        lineError={(line) => (line.id === failing ? 'Unit price must be at least 1.' : undefined)}
        footer={<TotalsFooter lines={lines} vatRate={0.21} />}
      />
    </div>
  )
}

const meta = {
  title: 'Components/InlineChildTable',
  component: Table,
  parameters: { layout: 'padded' },
  args: { lines: invoiceAt(0).lines, editable: true, reorderable: true, onReorder: fn() },
} satisfies Meta<typeof Table>
export default meta
type Story = StoryObj<typeof meta>

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export const Editable: Story = {}
export const ReadOnly: Story = { args: { editable: false, reorderable: false } }

/** Fields are fixed, but the lines can still be reordered. */
export const ReorderOnly: Story = { args: { editable: false } }

/** A line the server turned down says why under its cells. */
export const LineError: Story = { args: { failing: invoiceAt(0).lines[1]!.id } }

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
