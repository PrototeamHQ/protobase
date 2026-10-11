import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { createStaticSession, type ResourcePermissions } from '@protobase/client'
import { webhookResources } from '@protobase/schema'
import { App } from './app'
import { fakeApi } from './testing/fake-api'

const meta = { title: 'Built-in pages/Webhook subscriptions', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'lotte', email: 'lotte@example.test', name: 'Lotte de Vries', role: 'admin' })

// The pages `webhooks()` adds, as an app gets them.
const { webhookSubscriptions, webhookSubscriptionsView, webhookDeliveries, webhookDeliveriesView } = webhookResources('webhooks')

const rows = {
  webhookSubscriptions: [
    { id: '7d1f0c2a-0000-4000-8000-000000000001', name: 'Orders to the warehouse', events: 'orders.created orders.updated', url: 'https://warehouse.example.com/hooks/protobase', filter: 'total > 100', headers: null, payload: 'full', enabled: true, tenantId: '1', ownerId: 'lotte', disabledReason: null, lastSuccessAt: '2026-10-11T09:12:00Z', failingSince: null, createdAt: '2026-10-01T08:00:00Z', updatedAt: '2026-10-01T08:00:00Z', rotateSecret: false, sendTest: false, resendFailed: false },
    { id: '7d1f0c2a-0000-4000-8000-000000000002', name: 'Invoices to accounting', events: 'invoices.*', url: 'https://books.example.com/webhook', filter: null, headers: { 'x-api-key': 'k_123' }, payload: 'thin', enabled: false, tenantId: '1', ownerId: 'lotte', disabledReason: 'The receiver answered 410 Gone', lastSuccessAt: '2026-10-08T17:40:00Z', failingSince: '2026-10-09T06:00:00Z', createdAt: '2026-09-20T08:00:00Z', updatedAt: '2026-10-09T06:00:00Z', rotateSecret: false, sendTest: false, resendFailed: false },
  ],
  webhookDeliveries: [
    { id: 'a1', subscriptionId: '7d1f0c2a-0000-4000-8000-000000000001', tenantId: '1', eventType: 'orders.updated', eventId: 'evt_48211_updated', status: 'waiting', attempt: 3, nextAttempt: '2026-10-11T10:30:00Z', lastError: '503: down for maintenance', createdAt: '2026-10-11T09:20:00Z', resend: false },
  ],
}

const permissions: Record<string, ResourcePermissions> = {
  webhookSubscriptions: { read: true, create: true, update: true, delete: true, conditional: [] },
  webhookDeliveries: { read: true, create: false, update: true, delete: false, conditional: [] },
}

/** The rows the fake server holds, so a play can check what a save stored. */
let stored: Record<string, Array<Record<string, unknown>>> = {}

const Webhooks = ({ path }: { path: string }) => {
  const [api] = useState(() => {
    const created = fakeApi({
      resources: [webhookSubscriptions.toModel(), webhookDeliveries.toModel()],
      views: [webhookSubscriptionsView.toModel(webhookSubscriptions.toModel()), webhookDeliveriesView.toModel(webhookDeliveries.toModel())],
      rows: structuredClone(rows),
      permissions,
    })
    stored = created.rows
    return created
  })
  return (
    <div className="h-screen">
      <App client={api.client} auth={session} initialUrl={path} />
    </div>
  )
}

export const List: StoryObj = {
  tags: ['play'],
  render: () => <Webhooks path="/webhookSubscriptions" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(await canvas.findByText('Orders to the warehouse')).toBeTruthy()
    expect(canvas.getByText('Invoices to accounting')).toBeTruthy()
    expect(canvas.getByText('https://warehouse.example.com/hooks/protobase')).toBeTruthy()
  },
}

export const Subscription: StoryObj = {
  tags: ['play'],
  render: () => <Webhooks path="/webhookSubscriptions/7d1f0c2a-0000-4000-8000-000000000001" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(await canvas.findByRole('button', { name: /Send test event/ })).toBeTruthy()
    expect(canvas.getByRole('button', { name: /Rotate secret/ })).toBeTruthy()
    expect(await canvas.findByText('503: down for maintenance')).toBeTruthy()
    await userEvent.click(canvas.getByRole('button', { name: /Send test event/ }))
    await waitFor(() => expect(stored.webhookSubscriptions![0]!.sendTest).toBe(true))
  },
}

// The create form's labels sit beside their inputs, in one field each.
const inputOf = async (canvas: ReturnType<typeof within>, label: string) => {
  const found: HTMLElement = await canvas.findByText(label, { selector: 'label' })
  return found.parentElement!.parentElement!.querySelector('input, textarea') as HTMLElement
}

export const Create: StoryObj = {
  tags: ['play'],
  render: () => <Webhooks path="/webhookSubscriptions/new" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.type(await inputOf(canvas, 'Name'), 'Large orders to Slack')
    await userEvent.type(await inputOf(canvas, 'Events'), 'orders.large')
    await userEvent.type(await inputOf(canvas, 'URL'), 'https://hooks.slack.com/services/T000/B000/XXXX')
    await userEvent.click(canvas.getByRole('button', { name: /^Create/ }))
    await waitFor(() => expect(stored.webhookSubscriptions!.find((row) => row.name === 'Large orders to Slack')).toMatchObject({ events: 'orders.large', payload: 'full' }))
  },
}
