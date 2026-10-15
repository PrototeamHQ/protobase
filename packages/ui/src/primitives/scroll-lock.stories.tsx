import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { Button } from './button'
import { Dialog } from './dialog'
import { Sheet } from './sheet'

const meta = { title: 'Primitives/Scroll lock', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

// A page of `height` with a dialog and a sheet to open over it
const Page = ({ height }: { height: string }) => {
  const [open, setOpen] = useState<'dialog' | 'sheet'>()
  const close = () => setOpen(undefined)
  return (
    <div data-testid="page" className="flex items-start gap-2 bg-muted p-4" style={{ height }}>
      <Button onClick={() => setOpen('dialog')}>Open dialog</Button>
      <Button onClick={() => setOpen('sheet')}>Open sheet</Button>
      {open === 'dialog' && <Dialog title="A dialog" onClose={close} actions={<Button onClick={close}>Close</Button>} />}
      <Sheet title="A sheet" open={open === 'sheet'} onClose={close}>
        Over the page
      </Sheet>
    </div>
  )
}

const scrollbarWidth = () => {
  const probe = document.createElement('div')
  probe.style.cssText = 'position: absolute; width: 100px; height: 100px; overflow: scroll'
  document.body.append(probe)
  const width = probe.offsetWidth - probe.clientWidth
  probe.remove()
  return width
}

/** Opens the dialog and then the sheet, and checks the page behind keeps its width while each is open and after. */
const checkWidth = async (canvasElement: HTMLElement) => {
  // Only a scrollbar that takes room can change the page's width
  expect(scrollbarWidth()).toBeGreaterThan(0)
  const canvas = within(canvasElement)
  const page = canvas.getByTestId('page')
  const width = page.getBoundingClientRect().width
  for (const name of ['dialog', 'sheet']) {
    await userEvent.click(canvas.getByRole('button', { name: `Open ${name}` }))
    await canvas.findByRole('dialog', { name: `A ${name}` })
    expect(page.getBoundingClientRect().width).toBe(width)
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(canvas.queryByRole('dialog')).toBeNull())
    expect(page.getBoundingClientRect().width).toBe(width)
  }
}

export const TallPage: StoryObj = {
  name: 'A modal over a page with a scrollbar keeps its width (checks)',
  tags: ['play', 'scrollbars', '!dev'],
  render: () => <Page height="200vh" />,
  play: async ({ canvasElement }) => {
    expect(window.innerWidth).toBeGreaterThan(document.documentElement.clientWidth)
    await checkWidth(canvasElement)
  },
}

export const ShortPage: StoryObj = {
  name: 'A modal over a page without a scrollbar keeps its width (checks)',
  tags: ['play', 'scrollbars', '!dev'],
  render: () => <Page height="50vh" />,
  play: async ({ canvasElement }) => {
    expect(window.innerWidth).toBe(document.documentElement.clientWidth)
    await checkWidth(canvasElement)
  },
}
