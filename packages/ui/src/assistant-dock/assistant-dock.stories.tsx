import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { ProjectUiProvider } from '../app/pages/project-ui-provider'
import { fakeAssistant } from '../app/testing/fake-assistant'
import { AssistantDock } from './assistant-dock'
import { conversation } from './fixtures'
import { useAssistant } from './use-assistant'
import { taskBackend, widgetComponents, widgetConversation } from './widget-fixtures'

const meta = {
  title: 'Components/AssistantDock',
  component: AssistantDock,
  parameters: { layout: 'fullscreen' },
  args: { state: conversation, onSend: fn(), onAction: fn(), onClose: fn() },
  decorators: [(Story) => <div className="flex h-[760px] justify-end bg-background"><Story /></div>],
} satisfies Meta<typeof AssistantDock>

export default meta
type Story = StoryObj<typeof meta>

/** A query result as a table, and a proposal-like card with two buttons, all generic parts from the backend. */
export const Conversation: Story = {
  tags: ['play'],
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    canvas.getByText('Example backend')
    await userEvent.click(canvas.getByRole('button', { name: 'Approve' }))
    expect(args.onAction).toHaveBeenCalledWith('proposal-1', 'approve')
  },
}

export const Empty: Story = { args: { state: { messages: [], replying: false } } }

/** The backend is answering: a message can be written but not sent. */
export const Replying: Story = {
  tags: ['play'],
  args: { state: { ...conversation, replying: true } },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.type(canvas.getByRole('textbox', { name: 'Message' }), 'And the record view{Enter}')
    expect(canvas.getByRole('button', { name: 'Send' })).toBeDisabled()
    expect(args.onSend).not.toHaveBeenCalled()
  },
}

export const Offline: Story = { args: { offline: true } }

export const NotDelivered: Story = { args: { error: 'The assistant is still answering' } }

/** A failure the backend reports as a danger card. */
export const Failed: Story = {
  args: {
    state: {
      replying: false,
      messages: [
        { id: 'm1', from: 'user', parts: [{ type: 'text', id: 'm1-text', text: 'How many orders shipped today?' }] },
        { id: 'm2', from: 'assistant', parts: [{ type: 'card', id: 'm2-error', tone: 'danger', title: 'The assistant could not answer', body: 'The model endpoint answered 401: No auth credentials found (check the API key)' }] },
      ],
    },
  },
}

const Live = () => {
  const [backend] = useState(() => fakeAssistant({ delayMs: 50 }))
  const { state, offline, error, send, act } = useAssistant(backend)
  return <AssistantDock state={state} offline={offline} error={error} onSend={send} onAction={act} />
}

/** Against the in-memory fake backend: a message gets a proposal card; Ask for changes sets the composer, Approve applies it. */
export const AgainstFakeBackend: Story = {
  tags: ['play'],
  render: () => <Live />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const box = canvas.getByRole('textbox', { name: 'Message' })
    await userEvent.type(box, 'Add a discount to invoices{Enter}')
    const card = await canvas.findByRole('region', { name: 'Add a discount to invoices' })
    await userEvent.click(within(card).getByRole('button', { name: 'Ask for changes' }))
    await waitFor(() => expect(box).toHaveAttribute('placeholder', 'What should change in the proposal?'))
    expect(box).toHaveFocus()
    await userEvent.click(within(card).getByRole('button', { name: 'Approve' }))
    await within(card).findByText('Approved. The change is applied.')
    expect(within(card).queryByRole('button', { name: 'Approve' })).toBeNull()
  },
}

const WithWidgets = () => {
  const [backend] = useState(taskBackend)
  return (
    <ProjectUiProvider ui={{ components: widgetComponents }}>
      <AssistantDock state={widgetConversation} client={backend} />
    </ProjectUiProvider>
  )
}

/**
 * Widget parts drawn by the app's components, which read the backend themselves: a task waiting for a decision, one
 * someone else declined since, a component the app does not have (with and without a fallback) and one that throws.
 */
export const Widgets: Story = {
  tags: ['play'],
  render: () => <WithWidgets />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const waiting = await canvas.findByRole('region', { name: 'Add a discount to invoices' })
    within(waiting).getByText('waiting')
    await userEvent.click(within(waiting).getByRole('button', { name: 'Decline' }))
    await within(waiting).findByText('Declined by Ada Lovelace')
    expect(within(waiting).queryByRole('button', { name: 'Approve' })).toBeNull()

    const declined = await canvas.findByRole('region', { name: 'Archive old customers' })
    within(declined).getByText('Declined by Grace Hopper')

    const unknown = canvas.getByRole('region', { name: 'CPU usage this week' })
    within(unknown).getByText('Peaked at 82% on Tuesday.')
    within(unknown).getByText('This version of the app cannot show it live.')
    canvas.getByText('InvoicePreview: This version of the app cannot show it live.')

    const broken = canvas.getByRole('region', { name: 'A broken widget' })
    within(broken).getByText('It could not be drawn.')
    expect(canvas.queryByText('Broken widget')).toBeNull()
  },
}
