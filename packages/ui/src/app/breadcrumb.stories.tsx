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

const phone = { name: 'Phone', styles: { width: '390px', height: '844px' }, type: 'mobile' }

const Rentals = ({ path }: { path: string }) => {
  const [client] = useState(() => fakeApi({ resources: rentalResources, views: rentalViews, rows: rentalRows }).client)
  return (
    <div className="h-screen">
      <App client={client} auth={session} initialUrl={path} basePath="/admin" />
    </div>
  )
}

/**
 * A record page's trail ends at its list, linked and not the current page, since the heading names the record; the
 * default `public` schema is no sidebar group, so it is no crumb either.
 */
export const RecordLinks: StoryObj = {
  tags: ['play'],
  render: () => <Rentals path="/admin/tenants/1" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const trail = within(await canvas.findByRole('navigation', { name: 'Breadcrumb' }))
    await canvas.findByRole('heading', { name: 'Ada de Vries' })
    const list = trail.getByRole('link', { name: 'Tenants' })
    expect(list).toHaveAttribute('href', '/admin/tenants')
    expect(list).not.toHaveAttribute('aria-current')
    expect(trail.getAllByRole('link')).toHaveLength(1)
    expect(trail.queryByText('Ada de Vries')).toBeNull()
    expect(trail.queryByText(/public/i)).toBeNull()

    await userEvent.click(list)
    await canvas.findByRole('link', { name: /New tenant/ })
    expect(trail.getByRole('link', { name: 'Tenants' })).toHaveAttribute('aria-current', 'page')
  },
}

/** On a phone the top bar's back button names the list a record sits under, as one link, and the heading names the record. */
export const RecordOnPhone: StoryObj = {
  tags: ['play', 'phone'],
  parameters: { viewport: { options: { phone } } },
  globals: { viewport: { value: 'phone' } },
  render: () => <Rentals path="/admin/tenants/1" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByRole('heading', { name: 'Ada de Vries' })
    const trail = within(canvas.getByRole('navigation', { name: 'Breadcrumb' }))
    expect(trail.queryByRole('link')).toBeNull()
    const back = canvas.getByRole('link', { name: 'Back to Tenants' })
    expect(back).toHaveAttribute('href', '/admin/tenants')
    expect(back).toHaveTextContent('Tenants')
    expect(back.getBoundingClientRect().height).toBeGreaterThanOrEqual(44)

    await userEvent.click(canvas.getByRole('link', { name: 'Back to Tenants' }))
    await canvas.findByRole('link', { name: /New tenant/ })
    expect(trail.getByRole('link', { name: 'Tenants' })).toHaveAttribute('aria-current', 'page')
    expect(canvas.queryByRole('link', { name: /^Back to/ })).toBeNull()
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
