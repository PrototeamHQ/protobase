import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, within } from 'storybook/test'
import { createStaticSession, type ResourcePermissions } from '@protobase/client'
import { App } from './app'
import { fakeApi } from './testing/fake-api'
import { rentalResources, rentalRows, rentalViews } from './testing/rentals-domain'

const meta = { title: 'Record page/Header', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'story', email: 'story@example.test', name: 'Story User', role: 'manager' })

const permissions: Record<string, ResourcePermissions> = Object.fromEntries(rentalResources.map((model) => [model.name, { read: true, create: true, update: true, delete: true, conditional: [] }]))

// A unit whose status was never set, as a row from a database with the column empty
const rows = { ...rentalRows, units: [...rentalRows.units, { id: 4, property_id: 2, label: 'Oudegracht 9', status: null }] }

const Units = ({ path }: { path: string }) => {
  const [api] = useState(() => fakeApi({ resources: rentalResources, views: rentalViews, rows, permissions }))
  return (
    <div className="h-screen">
      <App client={api.client} auth={session} initialUrl={path} />
    </div>
  )
}

const header = async (canvasElement: HTMLElement, title: string) => (await within(canvasElement).findByRole('heading', { level: 1, name: title })).closest('header')!

export const MissingStatus: StoryObj = {
  name: 'No badge for a missing status (checks)',
  tags: ['play'],
  render: () => <Units path="/units/4" />,
  play: async ({ canvasElement }) => {
    const top = await header(canvasElement, 'Oudegracht 9')
    expect(top.textContent).not.toContain('null')
    expect(within(top).queryByText('Unit')).toBeNull()
  },
}

export const Status: StoryObj = {
  name: 'The status as the badge (checks)',
  tags: ['play'],
  render: () => <Units path="/units/2" />,
  play: async ({ canvasElement }) => {
    const top = await header(canvasElement, 'Keizersgracht 120 2.02')
    expect(within(top).getByText('Vacant')).toBeVisible()
  },
}

export const TitleOnly: StoryObj = {
  name: 'The title without the collection or when it was updated (checks)',
  tags: ['play'],
  render: () => <Units path="/units/2" />,
  play: async ({ canvasElement }) => {
    const top = await header(canvasElement, 'Keizersgracht 120 2.02')
    // The breadcrumb names the collection as a link, and the sidebar says when the record changed
    expect(within(top).queryByText('Units')).toBeNull()
    expect(top.textContent).not.toMatch(/Last updated|Last edited/)
  },
}

export const DeleteInRail: StoryObj = {
  name: 'Delete among the actions, Save with the form (checks)',
  tags: ['play'],
  render: () => <Units path="/units/2" />,
  play: async ({ canvasElement }) => {
    const top = await header(canvasElement, 'Keizersgracht 120 2.02')
    // The rail holds Delete as one of the record's actions; the header keeps only the form's Save
    const rail = (await within(canvasElement).findByRole('heading', { name: 'Actions' })).parentElement!
    expect(within(rail).getByRole('button', { name: 'Delete' })).toBeInTheDocument()
    expect(within(top).queryByRole('button', { name: 'Delete' })).toBeNull()
    expect(within(top).getByRole('button', { name: 'Save' })).toBeVisible()
  },
}
