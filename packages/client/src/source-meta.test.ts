import { describe, expect, it } from 'vitest'
import { f, l, resource, view } from '@protobase/schema'
import { sourceMeta } from './source-meta'
import type { Meta } from './types'

const customers = resource('customers').table('customers').fields({ id: f.integer().readOnly(), name: f.text() }).primaryKey((r) => r.id)
const agents = resource('agents').table('agents').fields({ id: f.integer().readOnly(), name: f.text() }).primaryKey((r) => r.id)
const tickets = resource('tickets')
  .table('tickets')
  .fields({ id: f.integer().readOnly(), title: f.text(), customer_id: f.relation('customers'), agent_id: f.relation('agents') })
  .primaryKey((r) => r.id)
const notes = resource('notes').table('notes').fields({ id: f.integer().readOnly(), ticket_id: f.relation('tickets').filterable(), agent_id: f.relation('agents'), body: f.text() }).primaryKey((r) => r.id)

const ticketsView = view<typeof tickets>('tickets')
  .layout((r) => [
    l.section('Ticket', [r.title, r.customer_id]),
    l.related('Notes', { resource: 'notes', field: 'ticket_id', columns: ['body', 'agent_id.name'] }),
    l.related('Same customer', { resource: 'customers', field: 'id' }),
    l.group('More', [l.related('Elsewhere', { resource: 'customers', field: 'id' })], { collapsed: true }),
    l.group('Notes again', [l.related('Notes too', { resource: 'notes', field: 'ticket_id' })]),
  ])
  .actions((a) => [
    a.link('notes', { label: 'Notes', to: { kind: 'list', resource: 'notes', filter: 'ticket_id = {id}' } }),
    a.link('customer', { label: 'Customer', to: { kind: 'record', resource: 'customers', key: '{customer_id}' } }),
    a.link('home', { label: 'Home', to: { kind: 'page', page: 'overview' } }),
    a.link('web', { label: 'Web', href: 'https://desk.example.com/t/{id}' }),
    a.update('close', { label: 'Close', set: { title: 'closed' } }),
  ])

const allowed = { read: true, create: true, update: true, delete: false, conditional: [] }

// The desk serves customers, agents, tickets and notes; the shop draws only tickets and notes from it.
const deskMeta: Meta = {
  appName: 'Service desk',
  resources: [customers, agents, tickets, notes].map((entry) => entry.toModel()),
  views: [ticketsView.toModel()],
  permissions: { tickets: allowed, notes: allowed, customers: allowed },
}
const desk = { url: 'https://desk.example.com/api/v1', label: 'Service desk', resources: ['tickets', 'notes', 'macros'] }

describe('sourceMeta', () => {
  const drawn = sourceMeta(deskMeta, desk)

  it('keeps the resources the source lists that the user may see there, with their views and permissions', () => {
    expect(drawn.resources.map((model) => model.name)).toEqual(['tickets', 'notes'])
    expect(drawn.views.map((entry) => entry.resource)).toEqual(['tickets'])
    expect(drawn.permissions).toEqual({ tickets: allowed, notes: allowed })
  })

  it('shows the key of a relation to a resource it does not draw, and keeps one within the source', () => {
    const [ticketsModel, notesModel] = drawn.resources
    expect(ticketsModel!.fields.customer_id).not.toHaveProperty('relation')
    expect(ticketsModel!.fields.customer_id!.type).toBe('relation')
    expect(notesModel!.fields.ticket_id!.relation).toEqual({ resource: 'tickets', columns: ['ticket_id'] })
  })

  it('leaves out related records, columns and links that lead out of the source', () => {
    const [ticketsView] = drawn.views
    expect(ticketsView!.layout).toEqual([
      { kind: 'section', title: 'Ticket', fields: ['title', 'customer_id'] },
      { kind: 'related', title: 'Notes', resource: 'notes', field: 'ticket_id', columns: ['body'] },
      { kind: 'group', title: 'Notes again', items: [{ kind: 'related', title: 'Notes too', resource: 'notes', field: 'ticket_id' }] },
    ])
    expect(ticketsView!.actions.map((action) => action.name)).toEqual(['notes', 'web', 'close'])
  })
})
