import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { ApiError, createStaticSession, type ResourcePermissions } from '@protobase/client'
import { f, l, resource, view } from '@protobase/schema'
import { App } from './app'
import { fakeApi } from './testing/fake-api'

const meta = { title: 'Record page/AI actions', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'story', email: 'story@example.test', name: 'Story User', role: 'admin' })

const tickets = resource('tickets')
  .table('tickets')
  .fields({ id: f.integer().readOnly().filterable().sortable(), title: f.text(), description: f.text().optional(), priority: f.enum(['low', 'high']).optional() })
  .primaryKey((r) => r.id)

const ticketsView = view<typeof tickets>('tickets')
  .title((r) => r.title)
  .names({ singular: 'Ticket', plural: 'Tickets' })
  .recordMode('read')
  .fields((r) => ({ priority: r.priority.valueLabels({ low: 'Low', high: 'High' }) }))
  .layout((r) => [l.section('Ticket', [r.title, r.description, r.priority])])
  .actions((a) => [a.ai('triage', { label: 'Suggest priority', icon: 'tag', prompt: 'How urgent is this?\n\n{title}\n{description}', writes: 'priority' })])

const rows = { tickets: [{ id: 1, title: 'Printer on fire', description: 'Smoke on the second floor', priority: null }] }
const permissions: Record<string, ResourcePermissions> = { tickets: { read: true, create: true, update: true, delete: false, conditional: [] } }

// The model answers `answer`, or fails as the server does when the endpoint does not answer.
const Tickets = ({ answer }: { answer: () => Promise<Record<string, unknown>> }) => {
  const [api] = useState(() => fakeApi({ resources: [tickets.toModel()], views: [ticketsView.toModel()], rows: structuredClone(rows), permissions, generate: answer }))
  return (
    <div className="h-screen">
      <App client={api.client} auth={session} initialUrl="/tickets/1" />
    </div>
  )
}

const unavailable = () => Promise.reject(new ApiError({ type: 'urn:protobase:problem:ai-unavailable', title: 'Bad Gateway', status: 502, detail: 'The model did not answer. Try again later.' }))

const section = async (canvasElement: HTMLElement) => within((await within(canvasElement).findByRole('heading', { name: 'Ticket' })).closest('section')!)

export const SuggestPriority: StoryObj = {
  tags: ['play'],
  render: () => <Tickets answer={async () => ({ priority: 'high' })} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const ticket = await section(canvasElement)
    expect(ticket.queryByText('High')).toBeNull()
    await userEvent.click(await canvas.findByRole('button', { name: 'Suggest priority' }))
    expect(await canvas.findByText('Suggest priority: done')).toBeInTheDocument()
    await waitFor(() => expect(ticket.getByText('High')).toBeInTheDocument())
  },
}

export const ModelFails: StoryObj = {
  tags: ['play'],
  render: () => <Tickets answer={unavailable} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByRole('button', { name: 'Suggest priority' }))
    expect(await canvas.findByText('Suggest priority failed')).toBeInTheDocument()
    expect(canvas.getByText('The model did not answer. Try again later.')).toBeInTheDocument()
  },
}

export const OnAPhone: StoryObj = {
  tags: ['play', 'phone'],
  render: () => <Tickets answer={async () => ({ priority: 'low' })} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const button = await canvas.findByRole('button', { name: 'Suggest priority' })
    expect(button.getBoundingClientRect().right).toBeLessThanOrEqual(document.documentElement.clientWidth)
    await userEvent.click(button)
    expect(await canvas.findByText('Suggest priority: done')).toBeInTheDocument()
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(document.documentElement.clientWidth)
  },
}
