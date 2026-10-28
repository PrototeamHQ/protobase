import type { Meta, StoryObj } from '@storybook/react-vite'
import { Fragment, useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { Button } from '../primitives/button'
import { ChatDivider } from './chat-divider'
import { ChatMessage } from './chat-message'
import { ChatThread } from './chat-thread'

const meta = { title: 'Components/Chat/Unread', parameters: { layout: 'centered' }, decorators: [(Story) => <div className="flex h-[480px] w-[380px] flex-col border border-border bg-surface"><Story /></div>] } satisfies Meta
export default meta

const author = { id: 'ann', name: 'Ann de Vries' }

// Messages 1 to 40, the "New messages" line above `firstNew` when given, a button that receives the next, and how
// often the thread said the reader read to the end.
const Unread = ({ firstNew }: { firstNew?: number }) => {
  const [last, setLast] = useState(40)
  const [reads, setReads] = useState(0)
  const numbers = Array.from({ length: last }, (_, index) => index + 1)
  return (
    <>
      <ChatThread length={numbers.length} onReadToEnd={() => setReads((count) => count + 1)}>
        {numbers.map((number) => (
          <Fragment key={number}>
            {number === firstNew && <ChatDivider tone="new" />}
            <ChatMessage author={author}>Message {number}</ChatMessage>
          </Fragment>
        ))}
      </ChatThread>
      <div className="flex items-center gap-3 border-t border-border p-3">
        <Button onClick={() => setLast(last + 1)}>Receive</Button>
        <output aria-label="Read to the end">{reads}</output>
      </div>
    </>
  )
}

const parts = (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement)
  const box = canvas.getByRole('log').parentElement!
  const atEnd = () => Math.abs(box.scrollHeight - box.scrollTop - box.clientHeight) <= 1
  const reads = () => Number(canvas.getByRole('status', { name: 'Read to the end' }).textContent)
  return { canvas, box, atEnd, reads }
}

const frame = () => new Promise((resolve) => requestAnimationFrame(resolve))

/** A chat with new messages opens on the "New messages" line near its top, not at the end, and has not been read to the end. */
export const OpensOnNewMessages: StoryObj = {
  tags: ['play'],
  render: () => <Unread firstNew={25} />,
  play: async ({ canvasElement }) => {
    const { canvas, box, atEnd, reads } = parts(canvasElement)
    const line = canvas.getByRole('separator', { name: 'New messages' })
    await waitFor(() => expect(line.getBoundingClientRect().top - box.getBoundingClientRect().top).toBeCloseTo(16, 0))
    expect(atEnd()).toBe(false)
    await frame()
    expect(reads()).toBe(0)

    // Scrolling to the end reads it, and the reader then follows new messages
    box.scrollTop = box.scrollHeight
    await waitFor(() => expect(reads()).toBe(1))
    await userEvent.click(canvas.getByRole('button', { name: 'Receive' }))
    await waitFor(() => expect(canvas.getByText('Message 41')).toBeInTheDocument())
    expect(atEnd()).toBe(true)
    await waitFor(() => expect(reads()).toBe(2))
  },
}

/** A chat without new messages opens at the end, which reads it; scrolled back, a new message is not read until the reader scrolls to it. */
export const ReadsToTheEnd: StoryObj = {
  tags: ['play'],
  render: () => <Unread />,
  play: async ({ canvasElement }) => {
    const { canvas, box, atEnd, reads } = parts(canvasElement)
    await waitFor(() => expect(atEnd()).toBe(true))
    expect(reads()).toBe(1)

    box.scrollTop = 0
    await waitFor(() => expect(atEnd()).toBe(false))
    await frame()
    await userEvent.click(canvas.getByRole('button', { name: 'Receive' }))
    await waitFor(() => expect(canvas.getByText('Message 41')).toBeInTheDocument())
    await frame()
    expect(reads()).toBe(1)

    box.scrollTop = box.scrollHeight
    await waitFor(() => expect(reads()).toBe(2))
  },
}

/** A reader who scrolls to the end while the page is hidden has not read it until the page shows again. */
export const ReadsOnlyWhileShown: StoryObj = {
  tags: ['play'],
  render: () => <Unread />,
  play: async ({ canvasElement }) => {
    const { box, atEnd, reads } = parts(canvasElement)
    await waitFor(() => expect(reads()).toBe(1))
    box.scrollTop = 0
    await waitFor(() => expect(atEnd()).toBe(false))
    await frame()

    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    try {
      box.scrollTop = box.scrollHeight
      await waitFor(() => expect(atEnd()).toBe(true))
      await frame()
      expect(reads()).toBe(1)
    } finally {
      delete (document as { visibilityState?: unknown }).visibilityState
    }
    document.dispatchEvent(new Event('visibilitychange'))
    await waitFor(() => expect(reads()).toBe(2))
  },
}
