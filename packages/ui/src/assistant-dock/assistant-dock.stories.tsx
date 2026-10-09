import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { AssistantDock } from './assistant-dock'
import { conversation, live, plan, request } from './fixtures'

const meta = {
  title: 'Assistant/Dock',
  component: AssistantDock,
  parameters: { layout: 'fullscreen' },
  args: { items: conversation, balance: 12, onSend: fn(), onClose: fn(), onApprove: fn(), onRequestChanges: fn(), onCancel: fn(), onUpdatePlan: fn() },
  decorators: [(Story) => <div className="flex h-[760px] justify-end bg-background"><Story /></div>],
} satisfies Meta<typeof AssistantDock>

export default meta
type Story = StoryObj<typeof meta>

export const Empty: Story = { args: { items: [] } }

/** A query, a plan that holds up the queue, and the task waiting behind it. */
export const Conversation: Story = {
  tags: ['play'],
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const message = canvas.getByRole('textbox', { name: 'Message' })
    expect(canvas.getByRole('button', { name: 'Send' })).toBeDisabled()

    await userEvent.click(canvas.getByRole('button', { name: 'Ask for changes' }))
    expect(args.onRequestChanges).toHaveBeenCalledWith('t7')
    expect(message).toHaveFocus()
    expect(message).toHaveAttribute('placeholder', 'What should change in the plan?')

    await userEvent.type(message, 'Cap the discount at 20%{Enter}')
    expect(args.onSend).toHaveBeenCalledWith('Cap the discount at 20%')
    expect(message).toHaveValue('')
    expect(message).toHaveAttribute('placeholder', 'Ask for a change or about your data...')
  },
}

/** The balance is below the plan's quote. */
export const LowBalance: Story = {
  tags: ['play'],
  args: { balance: 2 },
  play: async ({ canvasElement }) => {
    expect(within(canvasElement).getByRole('button', { name: 'Approve · 3 credits' })).toBeDisabled()
  },
}

/** The model is replying: a message can be written but not sent. */
export const Replying: Story = {
  tags: ['play'],
  args: { replying: true, items: [{ kind: 'user', id: 'm1', text: request }] },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.type(canvas.getByRole('textbox', { name: 'Message' }), 'And the record view{Enter}')
    expect(canvas.getByRole('button', { name: 'Send' })).toBeDisabled()
    expect(args.onSend).not.toHaveBeenCalled()
  },
}

export const Running: Story = {
  args: {
    items: [
      { kind: 'user', id: 'm1', text: request },
      { kind: 'plan', id: 'p1', plan: { ...plan, status: 'approved' } },
      { kind: 'progress', id: 'r1', taskId: 't7', phase: 'running', steps: [{ label: 'Added a discount column (migration)', state: 'done' }, { label: 'Adding discount to the invoice list', state: 'running' }] },
    ],
  },
}

export const Done: Story = {
  args: {
    balance: 9,
    items: [
      { kind: 'user', id: 'm1', text: request },
      { kind: 'plan', id: 'p1', plan: { ...plan, status: 'approved' } },
      { kind: 'result', id: 'j1', result: live },
      { kind: 'assistant', id: 'm2', text: 'The discount is live. Open an invoice to set it.' },
    ],
  },
}
