import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { ActionCard } from '../action-card'
import { ChatMessage } from './chat-message'
import { ChatThread } from './chat-thread'
import { Composer } from './composer'

const meta = { title: 'Components/Chat', parameters: { layout: 'centered' }, decorators: [(Story) => <div className="flex h-[480px] w-[380px] flex-col border border-border bg-surface"><Story /></div>] } satisfies Meta
export default meta

export const Thread: StoryObj = {
  render: () => (
    <ChatThread length={3}>
      <ChatMessage from="user">Which invoices are still unpaid?</ChatMessage>
      <ChatMessage from="assistant">Two of the four largest: INV-0039 from Brightside and INV-0031 from Northwind.</ChatMessage>
      <ChatMessage from="assistant">
        <ActionCard title="Send a reminder?" tone="info" actions={[{ id: 'send', label: 'Send', style: 'primary' }, { id: 'skip', label: 'Not now' }]} />
      </ChatMessage>
    </ChatThread>
  ),
}

export const Empty: StoryObj = { render: () => <ChatThread length={0} empty="Ask a question about this app.">{null}</ChatThread> }

const send = fn()

/** Enter sends the trimmed text and clears the box; while busy, nothing is sent. */
export const ComposerSends: StoryObj = {
  tags: ['play'],
  render: () => <div className="mt-auto p-3"><Composer placeholder="Ask a question..." onSend={send} /></div>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const box = canvas.getByRole('textbox', { name: 'Message' })
    expect(canvas.getByRole('button', { name: 'Send' })).toBeDisabled()
    await userEvent.type(box, '  How many orders?  {Enter}')
    expect(send).toHaveBeenCalledWith('How many orders?')
    expect(box).toHaveValue('')
  },
}

export const ComposerBusy: StoryObj = {
  tags: ['play'],
  render: () => <div className="mt-auto p-3"><Composer busy onSend={send} /></div>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.type(canvas.getByRole('textbox', { name: 'Message' }), 'And the record view{Enter}')
    expect(canvas.getByRole('button', { name: 'Send' })).toBeDisabled()
  },
}
