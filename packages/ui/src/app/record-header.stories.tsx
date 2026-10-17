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

// The units view with the status in its sidebar too
const sidebarViews = rentalViews.map((entry) => (entry.resource === 'units' ? { ...entry, layout: [...entry.layout, { kind: 'sidebar' as const, fields: ['status'] }] } : entry))

const Units = ({ path, views = rentalViews }: { path: string; views?: typeof rentalViews }) => {
  const [api] = useState(() => fakeApi({ resources: rentalResources, views, rows, permissions }))
  return (
    <div className="h-screen">
      <App client={api.client} auth={session} initialUrl={path} />
    </div>
  )
}

const heading = (canvasElement: HTMLElement, title: string) => within(canvasElement).findByRole('heading', { level: 1, name: title })

export const MissingStatus: StoryObj = {
  name: 'No header for a missing status, the title for screen readers only (checks)',
  tags: ['play'],
  render: () => <Units path="/units/4" />,
  play: async ({ canvasElement }) => {
    // The breadcrumb names the record and its collection, so nothing is left to show above the sections
    const title = await heading(canvasElement, 'Oudegracht 9')
    expect(title).toHaveClass('sr-only')
    expect(title.closest('header')).toBeNull()
    expect(within(canvasElement).queryByText('null')).toBeNull()
  },
}

export const Status: StoryObj = {
  name: 'The status as the badge (checks)',
  tags: ['play'],
  render: () => <Units path="/units/2" />,
  play: async ({ canvasElement }) => {
    const top = (await heading(canvasElement, 'Keizersgracht 120 2.02')).closest('header')!
    expect(within(top).getByText('Vacant')).toBeVisible()
    // The breadcrumb names the collection as a link, and the sidebar says when the record changed
    expect(within(top).queryByText('Units')).toBeNull()
    expect(top.textContent).not.toMatch(/Last updated|Last edited/)
  },
}

export const SidebarStatus: StoryObj = {
  name: 'No badge for the status the sidebar shows (checks)',
  tags: ['play'],
  render: () => <Units path="/units/2" views={sidebarViews} />,
  play: async ({ canvasElement }) => {
    expect((await heading(canvasElement, 'Keizersgracht 120 2.02')).closest('header')).toBeNull()
    const summary = within(canvasElement).getByRole('heading', { name: 'Summary' }).parentElement!
    expect(within(summary).getByText('Vacant')).toBeVisible()
  },
}

export const SaveInSidebar: StoryObj = {
  name: 'Save leads the sidebar, Delete among the actions, no Discard (checks)',
  tags: ['play'],
  render: () => <Units path="/units/2" />,
  play: async ({ canvasElement }) => {
    const top = (await heading(canvasElement, 'Keizersgracht 120 2.02')).closest('header')!
    // The header holds no controls; Save leads the sidebar, above the rail with Delete as one of the record's actions
    const sidebar = within(canvasElement).getByRole('complementary')
    const rail = (await within(sidebar).findByRole('heading', { name: 'Actions' })).parentElement!
    expect(within(rail).getByRole('button', { name: 'Delete' })).toBeInTheDocument()
    expect(within(top).queryByRole('button')).toBeNull()
    const save = within(sidebar).getByRole('button', { name: 'Save' })
    expect(save).toBeVisible()
    expect(save.compareDocumentPosition(rail) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(canvasElement).queryByRole('button', { name: 'Discard' })).toBeNull()
  },
}
