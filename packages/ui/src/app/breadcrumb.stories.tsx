import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, within } from 'storybook/test'
import { createStaticSession } from '@protobase/client'
import { App } from './app'
import { fakeApi } from './testing/fake-api'
import { rentalResources, rentalRows, rentalViews } from './testing/rentals-domain'

const meta = { title: 'Shell/Breadcrumb', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'story', email: 'story@example.test', name: 'Story User', role: 'manager' })

const Rentals = ({ path }: { path: string }) => {
  const [api] = useState(() => fakeApi({ resources: rentalResources, views: rentalViews, rows: rentalRows }))
  return (
    <div className="h-screen">
      <App client={api.client} auth={session} initialUrl={path} basePath="/admin" />
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
