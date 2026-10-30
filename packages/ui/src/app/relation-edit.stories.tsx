import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { createStaticSession, type Client } from '@protobase/client'
import { f, l, resource, view } from '@protobase/schema'
import { App } from './app'
import { fakeApi } from './testing/fake-api'

const meta = { title: 'Record page/Relation edit', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'story', email: 'story@example.test', name: 'Story User', role: 'admin' })

// A person works at one company, which the record page lets the user change.
const companies = resource('companies')
  .table('companies')
  .fields({ id: f.integer().filterable().sortable(), name: f.text().filterable() })
  .primaryKey((r) => r.id)
  .search((r) => [r.name])

const people = resource('people')
  .table('people')
  .fields({ id: f.integer().filterable().sortable(), name: f.text(), company_id: f.relation('companies').filterable() })
  .primaryKey((r) => r.id)

const companiesView = view<typeof companies>('companies').icon('building')
  .title((r) => r.name)
  .names({ singular: 'Company', plural: 'Companies' })
  .layout((r) => [l.section('Company', [r.name])])

const peopleView = view<typeof people>('people').icon('users')
  .title((r) => r.name)
  .names({ singular: 'Person', plural: 'People' })
  .layout((r) => [l.section('Person', [r.name, r.company_id])])

const rows = {
  companies: [
    { id: 1, name: 'Acme' },
    { id: 2, name: 'Globex' },
  ],
  people: [{ id: 1, name: 'Ada', company_id: 1 }],
}

/** The rows the fake server holds, so a play can check what a save stored. */
let stored: Record<string, Array<Record<string, unknown>>> = {}

/** `readOnly` names the fields the server says this user may read but not change on the record. */
const People = ({ path, readOnly = [] }: { path: string; readOnly?: string[] }) => {
  const [client] = useState(() => {
    const api = fakeApi({ resources: [companies.toModel(), people.toModel()], views: [companiesView.toModel(), peopleView.toModel()], rows: structuredClone(rows) })
    stored = api.rows
    if (readOnly.length === 0) return api.client
    const fields = Object.fromEntries(['name', 'company_id'].map((name) => [name, readOnly.includes(name) ? ('read' as const) : ('edit' as const)]))
    const get = async (resource: string, key: string) => ({ ...(await api.client.get(resource, key)), permissions: { update: true, delete: true, fields } })
    return { ...api.client, get } as unknown as Client
  })
  return (
    <div className="h-screen">
      <App client={client} auth={session} initialUrl={path} />
    </div>
  )
}

/** A relation is chosen on the record's form like on the create form, saved as the chosen record's key, and links to it. */
export const ChangeAndSave: StoryObj = {
  tags: ['play'],
  render: () => <People path="/people/1" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const company = await canvas.findByDisplayValue('Acme')
    expect(canvas.getByRole('link', { name: 'Open Acme' })).toHaveAttribute('href', '/companies/1')
    await userEvent.click(company)
    await userEvent.click(await canvas.findByRole('option', { name: 'Globex' }))
    await waitFor(() => expect(company).toHaveValue('Globex'))
    await waitFor(() => expect(canvas.getByRole('link', { name: 'Open Globex' })).toHaveAttribute('href', '/companies/2'))
    await userEvent.click(canvas.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(stored.people![0]!.company_id).toBe(2))
  },
}

/** A relation the user may read but not change on this record stays a link to the record it points at. */
export const ReadOnlyStaysLink: StoryObj = {
  tags: ['play'],
  render: () => <People path="/people/1" readOnly={['company_id']} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByDisplayValue('Ada')
    expect(await canvas.findByRole('link', { name: 'Acme' })).toHaveAttribute('href', '/companies/1')
    expect(canvas.queryByDisplayValue('Acme')).toBeNull()
  },
}
