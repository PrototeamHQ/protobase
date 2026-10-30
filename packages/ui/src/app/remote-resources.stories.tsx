import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { ApiError, createStaticSession, type Client } from '@protobase/client'
import { component } from '@protobase/layout'
import { f, l, resource, view } from '@protobase/schema'
import { useMeta } from '../data/use-meta'
import { App } from './app'
import { useLayoutRecord } from './pages/record-scope'
import { defineUi } from './pages/project-ui'
import { fakeApi } from './testing/fake-api'

const meta = { title: 'Shell/Remote resources', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'sam', email: 'sam@shop.example', name: 'Sam', role: 'admin' })

// The shop's own orders, and the tickets and their notes a service desk serves, which the shop draws as its own.
const orders = resource('orders').table('orders').fields({ id: f.integer().readOnly().filterable().sortable(), number: f.text().sortable() }).primaryKey((r) => r.id)
const ordersView = view<typeof orders>('orders').title((r) => r.number).names({ singular: 'Order', plural: 'Orders' }).nav({ group: 'Sales' }).fields((r) => ({ number: r.number.format('code') }))

const tickets = resource('tickets')
  .table('tickets')
  .fields({ id: f.integer().readOnly().filterable().sortable(), title: f.text().sortable(), status: f.enum(['open', 'closed']).filterable(), updated_at: f.timestamp().readOnly().sortable() })
  .primaryKey((r) => r.id)
const notes = resource('ticket_notes')
  .table('ticket_notes')
  .fields({ id: f.integer().readOnly().filterable().sortable(), ticket_id: f.relation('tickets').filterable(), body: f.text() })
  .primaryKey((r) => r.id)

/**
 * A section the shop's UI draws on the desk's ticket page: the desk's view names it, the app resolves it by name. It
 * reads where the ticket comes from with `useMeta()`, as a plugin would.
 */
const TicketSummary = () => {
  const scope = useLayoutRecord()
  const source = useMeta().data?.sources?.find((status) => status.state === 'ready' && status.source.resources.includes('tickets'))?.source
  return <p>{`Ticket ${String(scope?.record.id)} is ${String(scope?.record.status)}, from the ${source?.label ?? 'app'}`}</p>
}

const ticketsView = view<typeof tickets>('tickets')
  .title((r) => r.title)
  .names({ singular: 'Ticket', plural: 'Tickets' })
  .nav({ group: 'Support', recent: { status: 'status', tones: { open: 'warning', closed: 'success' }, orderBy: 'updated_at desc' } })
  .fields((r) => ({ status: r.status.format('badge').valueLabels({ open: 'Open', closed: 'Closed' }) }))
  .list((r) => ({ columns: [r.title, r.status] }))
  .layout((r) => [
    l.section('Ticket', [r.title, r.status]),
    l.custom(component('TicketSummary', { plugin: 'desk' }), { title: 'Summary' }),
    l.related('Notes', { resource: 'ticket_notes', field: 'ticket_id', columns: ['body'] }),
  ])
const notesView = view<typeof notes>('ticket_notes').nav({ hidden: true })

const desk = { url: 'https://desk.example.com/api/v1', label: 'Service desk', resources: ['tickets', 'ticket_notes'] }

const deskApi = () =>
  fakeApi({
    resources: [tickets.toModel(), notes.toModel()],
    views: [ticketsView.toModel(), notesView.toModel()],
    rows: {
      tickets: [
        { id: 1, title: 'Wrong size delivered', status: 'closed', updated_at: '2026-10-01T09:00:00Z' },
        { id: 2, title: 'Parcel never arrived', status: 'open', updated_at: '2026-10-11T15:30:00Z' },
      ],
      ticket_notes: [{ id: 1, ticket_id: 2, body: 'Asked the carrier for a trace.' }],
    },
  }).client

// A desk that does not answer: its `/meta` fails as fetch does when nothing is listening.
const downDesk = () => ({ meta: () => Promise.reject(new TypeError('Failed to fetch')) }) as unknown as Client
// A desk that answers, but not to the shop's sign-in.
const refusingDesk = () => ({ meta: () => Promise.reject(new ApiError({ type: 'urn:protobase:problem:unauthenticated', title: 'Unauthorized', status: 401, detail: 'The bearer token is invalid or expired' })) }) as unknown as Client

const ui = defineUi({ components: { TicketSummary } })

const Shop = ({ start, desk: deskClient = deskApi }: { start: string; desk?: () => Client }) => {
  const [shop] = useState(() => fakeApi({ resources: [orders.toModel()], views: [ordersView.toModel()], rows: { orders: [{ id: 1, number: 'SO-1001' }] }, sources: [desk] }).client)
  const [sources] = useState(() => ({ [desk.url]: deskClient() }))
  return (
    <div className="h-screen">
      <App client={shop} sources={sources} auth={session} initialUrl={start} ui={ui} workspace="Sam's shop" />
    </div>
  )
}

/** The desk's tickets in the shop's sidebar, under the group the desk's view names, with its recent tickets. */
export const List: StoryObj = { render: () => <Shop start="/tickets" /> }

/** A ticket's page in the shop: its fields, the section the shop's UI draws, its notes, and the trail back to the list. */
export const Record: StoryObj = { render: () => <Shop start="/tickets/2" /> }

/** A desk that does not answer: its tickets are marked in the sidebar and say why, and the shop's own orders work. */
export const SourceDown: StoryObj = { render: () => <Shop start="/tickets" desk={downDesk} /> }

export const ListChecks: StoryObj = {
  ...List,
  name: 'List (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const page = within(await canvas.findByRole('main'))
    await page.findByText('Parcel never arrived')
    expect(page.getByText('Wrong size delivered')).toBeVisible()
    const trail = within(canvas.getByRole('navigation', { name: 'Breadcrumb' }))
    expect(trail.getByText('Support')).toBeVisible()
    expect(trail.getByRole('link', { name: 'Tickets' })).toHaveAttribute('href', '/tickets')
    const sidebar = within(canvas.getByRole('navigation', { name: 'Resources' }))
    expect(sidebar.getByRole('link', { name: 'Tickets' })).toHaveAttribute('aria-current', 'page')
    await waitFor(() => expect(sidebar.getByRole('link', { name: /Parcel never arrived/ })).toHaveAttribute('href', '/tickets/2'))
  },
}

export const RecordChecks: StoryObj = {
  ...Record,
  name: 'Record (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByRole('heading', { name: 'Parcel never arrived' })
    expect(await canvas.findByText('Ticket 2 is open, from the Service desk')).toBeVisible()
    expect(await canvas.findByText('Asked the carrier for a trace.')).toBeVisible()
    const trail = within(canvas.getByRole('navigation', { name: 'Breadcrumb' }))
    expect(trail.getByRole('link', { name: 'Parcel never arrived' })).toHaveAttribute('aria-current', 'page')
    await userEvent.click(trail.getByRole('link', { name: 'Tickets' }))
    await within(canvas.getByRole('main')).findByText('Wrong size delivered')
  },
}

export const SourceDownChecks: StoryObj = {
  ...SourceDown,
  name: 'Source down (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByRole('heading', { name: 'Cannot reach Service desk' })
    expect(canvas.getByText(/It did not answer/)).toBeVisible()
    expect(canvas.getByRole('button', { name: 'Try again' })).toBeVisible()
    const sidebar = within(canvas.getByRole('navigation', { name: 'Resources' }))
    expect(sidebar.getByRole('link', { name: 'Tickets: Cannot reach Service desk' })).toHaveAttribute('href', '/tickets')
    await userEvent.click(sidebar.getByRole('link', { name: 'Orders' }))
    await canvas.findByText('SO-1001')
  },
}

/** A desk that does not accept the shop's sign-in says so, with its own words. */
export const SignInRefused: StoryObj = {
  tags: ['play'],
  render: () => <Shop start="/tickets/2" desk={refusingDesk} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByRole('heading', { name: 'Cannot reach Service desk' })
    expect(canvas.getByText(/did not accept your sign-in: The bearer token is invalid or expired/)).toBeVisible()
  },
}
