import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { Button } from '../primitives/button'
import { ChatMessage } from './chat-message'
import { ChatThread } from './chat-thread'
import { Composer } from './composer'

const meta = { title: 'Components/Chat/Scrolling', parameters: { layout: 'centered' }, decorators: [(Story) => <div className="flex h-[480px] w-[380px] flex-col border border-border bg-surface"><Story /></div>] } satisfies Meta
export default meta

const author = { id: 'ann', name: 'Ann de Vries' }

// Messages 11 to 40, with ten earlier ones at a time down to the first, and a button that receives the next.
const Conversation = () => {
  const [first, setFirst] = useState(11)
  const [last, setLast] = useState(40)
  const numbers = Array.from({ length: last - first + 1 }, (_, index) => first + index)
  return (
    <>
      <ChatThread length={numbers.length} onLoadEarlier={first > 1 ? () => setFirst(first - 10) : undefined}>
        {numbers.map((number) => (
          <ChatMessage key={number} author={author}>
            Message {number}
          </ChatMessage>
        ))}
      </ChatThread>
      <div className="border-t border-border p-3">
        <Button onClick={() => setLast(last + 1)}>Receive</Button>
      </div>
    </>
  )
}

// Messages 1 to 30 and a composer, whose sent message arrives a moment after it is sent, as from a server.
const Sending = () => {
  const [messages, setMessages] = useState(Array.from({ length: 30 }, (_, index) => `Message ${index + 1}`))
  const [sent, setSent] = useState(0)
  const send = (message: string) => {
    setSent((count) => count + 1)
    setTimeout(() => setMessages((current) => [...current, message]), 100)
  }
  return (
    <>
      <ChatThread length={messages.length} followKey={sent}>
        {messages.map((message) => (
          <ChatMessage key={message} author={author}>
            {message}
          </ChatMessage>
        ))}
      </ChatThread>
      <div className="border-t border-border p-3">
        <Composer onSend={send} />
      </div>
    </>
  )
}

const parts = (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement)
  const box = canvas.getByRole('log').parentElement!
  const top = (text: string) => canvas.getByText(text).getBoundingClientRect().top - box.getBoundingClientRect().top
  const atEnd = () => Math.abs(box.scrollHeight - box.scrollTop - box.clientHeight) <= 1
  return { canvas, box, top, atEnd }
}

/** A reader at the end follows a new message; one who scrolled back stays where they are. */
export const FollowsAtTheEnd: StoryObj = {
  tags: ['play'],
  render: () => <Conversation />,
  play: async ({ canvasElement }) => {
    const { canvas, box, top, atEnd } = parts(canvasElement)
    await waitFor(() => expect(atEnd()).toBe(true))
    await userEvent.click(canvas.getByRole('button', { name: 'Receive' }))
    await waitFor(() => expect(canvas.getByText('Message 41')).toBeInTheDocument())
    expect(atEnd()).toBe(true)

    box.scrollTop = box.scrollHeight / 2
    await waitFor(() => expect(atEnd()).toBe(false))
    // The scroll event is in before the next message
    await new Promise((resolve) => requestAnimationFrame(resolve))
    const reading = top('Message 25')
    await userEvent.click(canvas.getByRole('button', { name: 'Receive' }))
    await waitFor(() => expect(canvas.getByText('Message 42')).toBeInTheDocument())
    expect(atEnd()).toBe(false)
    expect(top('Message 25')).toBeCloseTo(reading, 0)
  },
}

/** Loading earlier messages keeps the reader on the message they were reading, at the same height. */
export const LoadsEarlier: StoryObj = {
  tags: ['play'],
  render: () => <Conversation />,
  play: async ({ canvasElement }) => {
    const { canvas, box, top } = parts(canvasElement)
    box.scrollTop = 0
    await waitFor(() => expect(top('Message 11')).toBeGreaterThan(0))
    await new Promise((resolve) => requestAnimationFrame(resolve))
    const reading = top('Message 11')
    await userEvent.click(canvas.getByRole('button', { name: 'Load earlier messages' }))
    await waitFor(() => expect(canvas.getByText('Message 1')).toBeInTheDocument())
    expect(top('Message 11')).toBeCloseTo(reading, 0)
    // The first message has no earlier ones to load
    expect(canvas.queryByRole('button', { name: 'Load earlier messages' })).toBeNull()
  },
}

/** A reader who scrolled back and sends a message goes to the end and sees it arrive. */
export const SendingFollows: StoryObj = {
  tags: ['play'],
  render: () => <Sending />,
  play: async ({ canvasElement }) => {
    const { canvas, box, atEnd } = parts(canvasElement)
    await waitFor(() => expect(atEnd()).toBe(true))
    box.scrollTop = 0
    await waitFor(() => expect(atEnd()).toBe(false))
    await new Promise((resolve) => requestAnimationFrame(resolve))
    await userEvent.type(canvas.getByRole('textbox', { name: 'Message' }), 'My reply{Enter}')
    await waitFor(() => expect(canvas.getByText('My reply')).toBeInTheDocument())
    await waitFor(() => expect(atEnd()).toBe(true))
  },
}
