import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { createStaticSession, type HistoryChange, type ResourcePermissions } from '@protobase/client'
import { f, l, resource, view } from '@protobase/schema'
import { App } from './app'
import { fakeApi } from './testing/fake-api'

const meta = { title: 'Record page/History', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'story', email: 'story@example.test', name: 'Story User', role: 'admin' })

const tickets = resource('tickets')
  .table('tickets')
  .fields({
    id: f.integer().readOnly().filterable().sortable(),
    title: f.text(),
    status: f.enum(['open', 'in_progress', 'done']),
    iban: f.text().optional().sensitive(),
  })
  .primaryKey((r) => r.id)
  .history()

const statusLabels = { open: 'Open', in_progress: 'In progress', done: 'Done' }

// Without a layout, the record page ends with History by itself
const plainView = view<typeof tickets>('tickets').title((r) => r.title).names({ singular: 'Ticket', plural: 'Tickets' }).fields((r) => ({ status: r.status.valueLabels(statusLabels) }))

const laidOutView = plainView.layout((r) => [l.section('Ticket', [r.title, r.status, r.iban]), l.history('Changes', { limit: 2 })])

const before = { id: 1, title: 'Flat tyre', status: 'open', iban: null }
const history: Record<string, HistoryChange[]> = {
  'tickets/1': [
    { id: '1', at: '2026-10-14T09:12:00.000Z', operation: 'create', changed: [], after: before, actor: { id: 'u1', name: 'Ada Lovelace' }, databaseRole: 'app' },
    { id: '2', at: '2026-10-15T10:30:00.000Z', operation: 'update', changed: ['status'], before, after: { ...before, status: 'in_progress' }, actor: { id: 'u1', name: 'Ada Lovelace' }, databaseRole: 'app' },
    { id: '3', at: '2026-10-16T22:05:00.000Z', operation: 'update', changed: ['iban'], before: { ...before, status: 'in_progress' }, after: { ...before, status: 'in_progress' }, actor: null, databaseRole: 'billing_sync' },
  ],
}

const rows = { tickets: [{ id: 1, title: 'Flat tyre', status: 'in_progress', iban: 'NL91ABNA0417164300' }] }
const permissions: Record<string, ResourcePermissions> = { tickets: { read: true, create: true, update: true, delete: false, conditional: [] } }

const Tickets = ({ laidOut = false }: { laidOut?: boolean }) => {
  const [api] = useState(() => fakeApi({ resources: [tickets.toModel()], views: [(laidOut ? laidOutView : plainView).toModel()], rows, permissions, history }))
  return (
    <div className="h-screen">
      <App client={api.client} auth={session} initialUrl="/tickets/1" />
    </div>
  )
}

const section = async (canvasElement: HTMLElement, title: string) => within((await within(canvasElement).findByRole('heading', { name: title })).closest('section')!)

export const WhoChangedWhat: StoryObj = {
  tags: ['play'],
  render: () => <Tickets />,
  play: async ({ canvasElement }) => {
    const changes = await section(canvasElement, 'History')
    const items = await changes.findAllByRole('listitem')
    expect(items.map((item) => item.textContent)).toEqual([
      expect.stringContaining('Database (billing_sync) changed'),
      expect.stringContaining('Ada Lovelace changed'),
      expect.stringContaining('Ada Lovelace created this'),
    ])
    // A sensitive field is named, never shown; other fields show before and after as the view labels them
    expect(items[0]!.textContent).toContain('Ibanchanged')
    expect(items[1]!.textContent).toContain('StatusOpen → In progress')
  },
}

export const ASaveShowsUp: StoryObj = {
  tags: ['play'],
  render: () => <Tickets laidOut />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const changes = await section(canvasElement, 'Changes')
    expect(await changes.findAllByRole('listitem')).toHaveLength(2)
    await userEvent.click(changes.getByRole('button', { name: 'Show more' }))
    await waitFor(() => expect(changes.getAllByRole('listitem')).toHaveLength(3))
    // The ticket's only plain text input
    const title = canvasElement.querySelector<HTMLInputElement>('form input:not([type])')!
    await userEvent.clear(title)
    await userEvent.type(title, 'Flat tyre, front wheel')
    await userEvent.click(canvas.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(changes.getAllByRole('listitem')[0]!.textContent).toContain('Story User changed'), { timeout: 5000 })
    expect(changes.getAllByRole('listitem')[0]!.textContent).toContain('TitleFlat tyre → Flat tyre, front wheel')
  },
}
