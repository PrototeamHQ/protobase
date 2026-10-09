import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { invoiceAt } from '../mocks'
import { InlineChildTable } from './index'

const meta = {
  title: 'Components/InlineChildTable',
  component: InlineChildTable,
  parameters: { layout: 'padded' },
  args: { lines: invoiceAt(0).lines, onChange: () => {}, onReorder: fn() },
  render: (args) => {
    const [lines, setLines] = useState(args.lines)
    return (
      <div className="w-[760px]">
        <InlineChildTable
          {...args}
          lines={lines}
          onChange={setLines}
          onReorder={(next, move) => {
            args.onReorder?.(next, move)
            setLines(next)
          }}
        />
      </div>
    )
  },
} satisfies Meta<typeof InlineChildTable>
export default meta
type Story = StoryObj<typeof meta>

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export const Editable: Story = {}
export const ReadOnly: Story = { args: { readOnly: true } }
export const ReducedVat: Story = { args: { vatRate: 0.09 } }

/** Fields are fixed, but the lines can still be reordered, as on the live invoice. */
export const ReorderOnly: Story = { args: { readOnly: true, reorderable: true } }

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
