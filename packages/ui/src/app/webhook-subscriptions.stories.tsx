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
  webhook_subscriptions: [
    { id: '7d1f0c2a-0000-4000-8000-000000000001', name: 'Orders to the warehouse', events: 'orders.created orders.updated', url: 'https://warehouse.example.com/hooks/protobase', filter: 'total > 100', headers: null, payload: 'full', enabled: true, tenant_id: '1', owner_id: 'lotte', disabled_reason: null, last_success_at: '2026-10-11T09:12:00Z', failing_since: null, created_at: '2026-10-01T08:00:00Z', updated_at: '2026-10-01T08:00:00Z', rotate_secret: false, send_test: false, resend_failed: false },
    { id: '7d1f0c2a-0000-4000-8000-000000000002', name: 'Invoices to accounting', events: 'invoices.*', url: 'https://books.example.com/webhook', filter: null, headers: { 'x-api-key': 'k_123' }, payload: 'thin', enabled: false, tenant_id: '1', owner_id: 'lotte', disabled_reason: 'The receiver answered 410 Gone', last_success_at: '2026-10-08T17:40:00Z', failing_since: '2026-10-09T06:00:00Z', created_at: '2026-09-20T08:00:00Z', updated_at: '2026-10-09T06:00:00Z', rotate_secret: false, send_test: false, resend_failed: false },
  ],
  webhook_deliveries: [
    { id: 'a1', subscription_id: '7d1f0c2a-0000-4000-8000-000000000001', tenant_id: '1', event_type: 'orders.updated', event_id: 'evt_48211_updated', status: 'waiting', attempt: 3, next_attempt: '2026-10-11T10:30:00Z', last_error: '503: down for maintenance', created_at: '2026-10-11T09:20:00Z', resend: false },
  ],
}

const permissions: Record<string, ResourcePermissions> = {
  webhook_subscriptions: { read: true, create: true, update: true, delete: true, conditional: [] },
  webhook_deliveries: { read: true, create: false, update: true, delete: false, conditional: [] },
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
  render: () => <Webhooks path="/webhook_subscriptions" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(await canvas.findByText('Orders to the warehouse')).toBeTruthy()
    expect(canvas.getByText('Invoices to accounting')).toBeTruthy()
    expect(canvas.getByText('https://warehouse.example.com/hooks/protobase')).toBeTruthy()
  },
}

export const Subscription: StoryObj = {
  tags: ['play'],
  render: () => <Webhooks path="/webhook_subscriptions/7d1f0c2a-0000-4000-8000-000000000001" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(await canvas.findByRole('button', { name: /Send test event/ })).toBeTruthy()
    expect(canvas.getByRole('button', { name: /Rotate secret/ })).toBeTruthy()
    expect(await canvas.findByText('503: down for maintenance')).toBeTruthy()
    await userEvent.click(canvas.getByRole('button', { name: /Send test event/ }))
    await waitFor(() => expect(stored.webhook_subscriptions![0]!.send_test).toBe(true))
  },
}

// The create form's labels sit beside their inputs, in one field each.
const inputOf = async (canvas: ReturnType<typeof within>, label: string) => {
  const found: HTMLElement = await canvas.findByText(label, { selector: 'label' })
  return found.parentElement!.parentElement!.querySelector('input, textarea') as HTMLElement
}

export const Create: StoryObj = {
  tags: ['play'],
  render: () => <Webhooks path="/webhook_subscriptions/new" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.type(await inputOf(canvas, 'Name'), 'Large orders to Slack')
    await userEvent.type(await inputOf(canvas, 'Events'), 'orders.large')
    await userEvent.type(await inputOf(canvas, 'URL'), 'https://hooks.slack.com/services/T000/B000/XXXX')
    await userEvent.click(canvas.getByRole('button', { name: /^Create/ }))
    await waitFor(() => expect(stored.webhook_subscriptions!.find((row) => row.name === 'Large orders to Slack')).toMatchObject({ events: 'orders.large', payload: 'full' }))
  },
}
