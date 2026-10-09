import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, waitFor, within } from 'storybook/test'
import { createStaticSession, type Client, type RecordPermissions, type ResourcePermissions } from '@protobase/client'
import { f, l, resource, view } from '@protobase/schema'
import { App } from './app'
import { fakeApi } from './testing/fake-api'

const meta = { title: 'Record page/Empty cards', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'story', email: 'story@example.test', name: 'Story User', role: 'manager' })

// Amenities as a user who may only read them sees them: every field read-only, and no timestamps
const amenities = resource('amenities')
  .table('amenities')
  .fields({ code: f.text().readOnly().filterable().sortable(), name: f.text().readOnly() })
  .primaryKey((r) => r.code)

const owners = resource('owners')
  .table('owners')
  .fields({
    id: f.integer().readOnly().filterable().sortable(),
    name: f.text(),
    kind: f.enum(['private', 'company']),
    iban: f.text(),
    createdAt: f.timestamp().readOnly(),
    updatedAt: f.timestamp().readOnly(),
  })
  .primaryKey((r) => r.id)

const ownersView = view<typeof owners>('owners')
  .title((r) => r.name)
  .names({ singular: 'Owner', plural: 'Owners' })
  .fields((r) => ({ kind: r.kind.valueLabels({ private: 'Private', company: 'Company' }) }))
  .layout((r) => [l.section('Owner', [r.name]), l.section('Payout', [r.iban]), l.sidebar([r.kind])])

const resources = [amenities.toModel(), owners.toModel()]
const views = [view<typeof amenities>('amenities').names({ singular: 'Amenity', plural: 'Amenities' }).toModel(), ownersView.toModel()]
const rows = {
  amenities: [{ code: 'balcony', name: 'Balcony', etag: '"a1"' }],
  owners: [{ id: 1, name: 'Roos de Jong', kind: 'private', iban: 'NL91ABNA0417164300', createdAt: '2024-03-01T09:00:00Z', updatedAt: '2026-10-01T09:00:00Z', etag: '"o1"' }],
}
const permissions: Record<string, ResourcePermissions> = {
  amenities: { read: true, create: false, update: false, delete: false, conditional: [] },
  owners: { read: true, create: true, update: true, delete: false, conditional: [] },
}

/** `fields` is what the server says this user may do with each field of the record it returns; others are hidden. */
const Owners = ({ path, fields }: { path: string; fields?: RecordPermissions['fields'] }) => {
  const [client] = useState(() => {
    const api = fakeApi({ resources, views, rows, permissions })
    if (!fields) return api.client
    const get = async (name: string, key: string) => ({ ...(await api.client.get(name, key)), permissions: { update: true, delete: false, fields } })
    return { ...api.client, get } as unknown as Client
  })
  return (
    <div className="h-screen">
      <App client={client} auth={session} initialUrl={path} />
    </div>
  )
}

const sidebarCards = (canvasElement: HTMLElement) => within(canvasElement).queryAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)
const sections = (canvasElement: HTMLElement) => within(canvasElement).queryAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)

export const ReadOnlyWithoutTimestamps: StoryObj = {
  tags: ['play'],
  render: () => <Owners path="/amenities/balcony" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByRole('heading', { level: 1, name: 'Balcony' })
    // Nothing is editable, so the default section shows the fields locked instead of a lone heading
    await waitFor(() => expect(sections(canvasElement)).toEqual(['Details']))
    expect(canvas.getByText('Name')).toBeTruthy()
    // No created or updated timestamps: no Details card in the sidebar
    expect(sidebarCards(canvasElement)).toEqual([])
  },
}

export const WithTimestamps: StoryObj = {
  tags: ['play'],
  render: () => <Owners path="/owners/1" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByRole('heading', { level: 1, name: 'Roos de Jong' })
    expect(sections(canvasElement)).toEqual(['Owner', 'Payout'])
    expect(sidebarCards(canvasElement)).toEqual(['Summary', 'Details'])
    expect(canvas.getByText('Created at')).toBeTruthy()
  },
}

export const HiddenFields: StoryObj = {
  tags: ['play'],
  render: () => <Owners path="/owners/1" fields={{ name: 'edit' }} />,
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByRole('heading', { level: 1, name: 'Roos de Jong' })
    // Payout holds only the hidden IBAN, the Summary only the hidden kind, Details only hidden timestamps
    expect(sections(canvasElement)).toEqual(['Owner'])
    expect(sidebarCards(canvasElement)).toEqual([])
  },
}
