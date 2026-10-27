import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { ActionCard } from '../action-card'
import { ChatDivider } from './chat-divider'
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

const ann = { id: 'ann', name: 'Ann de Vries' }
const bo = { id: 'bo', name: 'Bo Jansen' }

/** A chat between people: each message under its author's name and time, a day line between days, a line above the new ones. */
export const People: StoryObj = {
  tags: ['play'],
  render: () => (
    <ChatThread length={4}>
      <ChatDivider label="Yesterday" />
      <ChatMessage author={ann} time="2026-10-26T15:02:00Z">The printer on the second floor is out of toner.</ChatMessage>
      <ChatMessage author={ann} time="2026-10-26T15:03:00Z" continued>Who orders it?</ChatMessage>
      <ChatDivider tone="new" />
      <ChatMessage author={bo} time="2026-10-27T08:15:00Z" footer="Read">I did, it comes tomorrow.</ChatMessage>
      <ChatMessage from="user" footer="Sent">Thanks both.</ChatMessage>
    </ChatThread>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(canvas.getAllByRole('separator').map((line) => line.getAttribute('aria-label'))).toEqual(['Yesterday', 'New messages'])
    // Times show on the viewer's clock, Amsterdam's in the play tests
    const first = canvas.getByText('The printer on the second floor is out of toner.').closest('[data-from="person"]')!
    expect(first.textContent).toBe('ADAnn de Vries16:02The printer on the second floor is out of toner.')
    expect(within(first as HTMLElement).getByText('16:02')).toHaveAttribute('datetime', '2026-10-26T15:02:00Z')
    // A message that follows the same author's leaves out their avatar, name and time
    expect(canvas.getByText('Who orders it?').closest('[data-from="person"]')!.textContent).toBe('Who orders it?')
    expect(canvas.getByText('I did, it comes tomorrow.').closest('[data-from="person"]')!.textContent).toBe('BJBo Jansen09:15I did, it comes tomorrow.Read')
    // The user's bubble keeps its look, with the footer under it
    const bubble = canvas.getByText('Thanks both.')
    expect(bubble).toHaveAttribute('data-from', 'user')
    expect(bubble.nextElementSibling).toHaveTextContent('Sent')
  },
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
    expect(send).toHaveBeenCalledWith('How many orders?', [])
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
