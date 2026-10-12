import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { createStaticSession, type Client } from '@protobase/client'
import { App } from './app'
import { fakeApi } from './testing/fake-api'
import { rentalResources, rentalRows, rentalViews } from './testing/rentals-domain'

const meta = { title: 'Shell/Breadcrumb', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'story', email: 'story@example.test', name: 'Story User', role: 'manager' })

const Rentals = ({ path, held }: { path: string; held?: Promise<void> }) => {
  const [client] = useState(() => {
    const { client } = fakeApi({ resources: rentalResources, views: rentalViews, rows: rentalRows })
    // Holds every record read until `held` settles, to show what the app looks like while one loads.
    return held ? { ...client, get: ((resource: string, key: string) => held.then(() => client.get(resource, key))) as Client['get'] } : client
  })
  return (
    <div className="h-screen">
      <App client={client} auth={session} initialUrl={path} basePath="/admin" />
    </div>
  )
}

/** The list and the record are links; the sidebar group has no page, so it stays text. */
export const RecordLinks: StoryObj = {
  tags: ['play'],
  render: () => <Rentals path="/admin/tenants/1" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const trail = within(await canvas.findByRole('navigation', { name: 'Breadcrumb' }))
    const current = await trail.findByRole('link', { name: 'Ada de Vries' })
    expect(current).toHaveAttribute('href', '/admin/tenants/1')
    expect(current).toHaveAttribute('aria-current', 'page')
    const list = trail.getByRole('link', { name: 'Tenants' })
    expect(list).toHaveAttribute('href', '/admin/tenants')
    expect(list).not.toHaveAttribute('aria-current')
    expect(trail.getAllByRole('link')).toHaveLength(2)
    expect(trail.getByText('Public').closest('a')).toBeNull()

    await userEvent.click(list)
    await canvas.findByRole('button', { name: /New tenant/ })
    expect(trail.getByRole('link', { name: 'Tenants' })).toHaveAttribute('aria-current', 'page')
  },
}

/** The create page ends in "New", linked to itself. */
export const NewLinks: StoryObj = {
  tags: ['play'],
  render: () => <Rentals path="/admin/tenants/new" />,
  play: async ({ canvasElement }) => {
    const trail = within(await within(canvasElement).findByRole('navigation', { name: 'Breadcrumb' }))
    const current = await trail.findByRole('link', { name: 'New' })
    expect(current).toHaveAttribute('href', '/admin/tenants/new')
    expect(current).toHaveAttribute('aria-current', 'page')
  },
}

/** Holds the record's read until "Finish loading" is pressed. */
const HeldRecord = () => {
  const [gate] = useState(() => {
    let release = () => {}
    const held = new Promise<void>((resolve) => (release = resolve))
    return { held, release }
  })
  return (
    <>
      <button type="button" className="fixed right-4 bottom-4 z-50 rounded border bg-background px-3 py-1.5 text-sm" onClick={gate.release}>
        Finish loading
      </button>
      <Rentals path="/admin/tenants/1" held={gate.held} />
    </>
  )
}

/** While the record loads, its crumb is a skeleton linked to the record, not the raw key; then it shows the title. */
export const RecordLoading: StoryObj = {
  tags: ['play'],
  render: () => <HeldRecord />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const trail = within(await canvas.findByRole('navigation', { name: 'Breadcrumb' }))
    const loading = await trail.findByRole('link', { name: 'Loading record' })
    expect(loading).toHaveAttribute('href', '/admin/tenants/1')
    expect(loading).toHaveAttribute('aria-busy', 'true')
    expect(trail.queryByText('1')).toBeNull()

    await userEvent.click(canvas.getByRole('button', { name: 'Finish loading' }))
    await waitFor(() => expect(trail.getByRole('link', { name: 'Ada de Vries' })).toHaveAttribute('aria-current', 'page'))
  },
}
