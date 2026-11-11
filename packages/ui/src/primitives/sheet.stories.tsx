import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { Button } from './button'
import { Sheet } from './sheet'

const meta = { title: 'Primitives/Sheet', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

type TouchStep = { type: 'start' | 'move'; x: number; y: number; waitMs?: number } | { type: 'end'; waitMs?: number }
// Real touch input, which the play-tests runner gives "touch" stories (scripts/play-tests/touch-input.mjs)
const touch = (steps: TouchStep[]) => (window as unknown as { pbTouch: (steps: TouchStep[]) => Promise<void> }).pbTouch(steps)

/** A finger from `from` down by `dy`, in `moves` moves `stepMs` apart, then lifted after `holdMs`. */
const fingerDrag = (from: { x: number; y: number }, dy: number, moves: number, stepMs: number, holdMs = 0): TouchStep[] => [
  { type: 'start', ...from },
  ...Array.from({ length: moves }, (_, index) => ({ type: 'move' as const, x: from.x, y: from.y + (dy * (index + 1)) / moves, waitMs: stepMs })),
  { type: 'end', waitMs: holdMs },
]

const centre = (element: Element) => {
  const box = element.getBoundingClientRect()
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 }
}

const Page = () => {
  const [open, setOpen] = useState(true)
  return (
    <div className="h-screen bg-muted p-4">
      <Button onClick={() => setOpen(true)}>Open sheet</Button>
      <Sheet title="Filters" open={open} onClose={() => setOpen(false)}>
        {Array.from({ length: 30 }, (_, index) => (
          <p key={index} className="py-2">
            Option {index + 1}
          </p>
        ))}
      </Sheet>
    </div>
  )
}

/** Drag it down by its header or its content, fling it, or let go early: it closes or springs back as a native sheet does. */
export const Default: StoryObj = { render: () => <Page /> }

const opened = async (canvasElement: HTMLElement) => {
  const dialog = await within(canvasElement).findByRole('dialog', { name: 'Filters' })
  // Risen into place
  await waitFor(() => expect(dialog.getBoundingClientRect().bottom).toBeCloseTo(window.innerHeight, 0))
  return dialog
}

const reopen = async (canvasElement: HTMLElement) => {
  await waitFor(() => expect(within(canvasElement).queryByRole('dialog')).toBeNull())
  await userEvent.click(within(canvasElement).getByRole('button', { name: 'Open sheet' }))
  return opened(canvasElement)
}

const content = (dialog: HTMLElement) => dialog.querySelector('header')!.nextElementSibling as HTMLElement

/** A fling, a slow long drag and a short one, a drag from scrolled content and the handle, with real touch at 390 px. */
export const DragChecks: StoryObj = {
  tags: ['play', 'touch', '!dev'],
  name: 'Drags under the finger and snaps (checks)',
  render: () => <Page />,
  play: async ({ canvasElement }) => {
    let dialog = await opened(canvasElement)

    // A quick flick down on the content closes it, though it went only 120 px
    await touch(fingerDrag(centre(content(dialog)), 120, 4, 16))
    dialog = await reopen(canvasElement)

    // A short slow drag springs back, and the sheet followed the finger meanwhile
    const start = dialog.getBoundingClientRect().top
    const from = centre(dialog.querySelector('h2')!)
    await touch(fingerDrag(from, 100, 10, 30).slice(0, -1))
    // Less the browser's touch slop, which it keeps before it sends a move
    expect(dialog.getBoundingClientRect().top - start).toBeGreaterThan(60)
    await touch([{ type: 'end', waitMs: 200 }])
    await waitFor(() => expect(dialog.getBoundingClientRect().top).toBeCloseTo(start, 0))
    expect(dialog).toBeInTheDocument()

    // A slow drag down past a third of its height closes it
    await touch(fingerDrag(from, dialog.getBoundingClientRect().height * 0.5, 20, 30, 200))
    dialog = await reopen(canvasElement)

    // Scrolled down, the content scrolls back up under the finger and the sheet stays put
    const area = content(dialog)
    area.scrollTop = 300
    await touch(fingerDrag(centre(area), 150, 10, 30, 200))
    await waitFor(() => expect(area.scrollTop).toBeLessThan(300))
    expect(dialog.getBoundingClientRect().top).toBeCloseTo(start, 0)

    // The handle is a button, for a screen reader or keyboard, that closes it
    await userEvent.click(within(dialog).getByRole('button', { name: 'Drag down to close' }))
    await waitFor(() => expect(within(canvasElement).queryByRole('dialog')).toBeNull())
  },
}
