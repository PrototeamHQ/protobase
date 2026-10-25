import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { createStaticSession } from '@protobase/client'
import { Card, Page, Tab, Table, Tabs, page } from '@protobase/layout'
import { f, resource, view } from '@protobase/schema'
import { App } from '../../app'
import { fakeApi } from '../../testing/fake-api'

const viewports = { mobile360: { name: 'Mobile 360', styles: { width: '360px', height: '740px' }, type: 'mobile' } } as const

const meta = { title: 'Composed pages/Tabs', parameters: { layout: 'fullscreen', viewport: { options: viewports } } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'story', email: 'story@example.test', name: 'Story User', role: 'admin' })

// A workshop's settings page: a note above the tabs, then one tab per concern, each at its own address

const invoices = resource('invoices')
  .table('invoices')
  .fields({ id: f.integer().readOnly().filterable().sortable(), number: f.text(), total: f.integer() })
  .primaryKey((r) => r.id)

const invoicesView = view<typeof invoices>('invoices')
  .title((r) => r.number)
  .names({ singular: 'Invoice', plural: 'Invoices' })

const settings = page(
  'settings',
  Page({
    title: 'Settings',
    description: 'How the workshop runs.',
    children: [
      Tabs({
        children: [
          Tab({ name: 'general', label: 'General', children: [Card({ title: 'Opening hours', children: 'Monday to Friday, 8:00 to 17:30.' }), Card({ title: 'Address', children: 'Werkstraat 12, Utrecht.' })] }),
          Tab({ name: 'billing', label: 'Billing', children: Table({ title: 'Invoices', resource: 'invoices', columns: ['number', 'total'] }) }),
          Tab({ name: 'notifications', label: 'Notifications', children: Card({ title: 'Email', children: 'A message for every new repair.' }) }),
        ],
      }),
    ],
  }),
)

const Settings = ({ url = '/settings' }: { url?: string }) => {
  const [api] = useState(() =>
    fakeApi({
      resources: [invoices.toModel()],
      views: [invoicesView.toModel()],
      pages: [settings.toModel()],
      rows: { invoices: [{ id: 1, number: 'INV-2026-001', total: 420 }] },
    }),
  )
  return (
    <div className="min-h-screen">
      <App client={api.client} auth={session} initialUrl={url} />
    </div>
  )
}

export const Tabbed: StoryObj = { name: 'Settings in tabs', render: () => <Settings /> }

export const Phone: StoryObj = { ...Tabbed, name: 'Settings in tabs, on a phone', globals: { viewport: { value: 'mobile360' } } }

export const UnknownTab: StoryObj = { name: 'A tab the page has not', render: () => <Settings url="/settings/payroll" /> }

/**
 * The first tab is at the page's own address and each other at its name below it; following one shows its elements
 * alone and names it in the browser tab's title.
 */
export const Checks: StoryObj = {
  ...Tabbed,
  name: 'Settings in tabs (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const nav = within(await canvas.findByRole('navigation', { name: 'Tabs' }))
    expect(nav.getByRole('link', { name: 'General' }).getAttribute('href')).toBe('/settings')
    expect(nav.getByRole('link', { name: 'General' })).toHaveAttribute('aria-current', 'page')
    expect(nav.getByRole('link', { name: 'Billing' }).getAttribute('href')).toBe('/settings/billing')
    expect(await canvas.findByRole('heading', { name: 'Opening hours' })).toBeVisible()
    await waitFor(() => expect(document.title).toBe('General · Settings · Protobase'))

    await userEvent.click(nav.getByRole('link', { name: 'Billing' }))
    expect(await canvas.findByText('INV-2026-001')).toBeVisible()
    expect(canvas.queryByRole('heading', { name: 'Opening hours' })).toBeNull()
    expect(nav.getByRole('link', { name: 'Billing' })).toHaveAttribute('aria-current', 'page')
    await waitFor(() => expect(document.title).toBe('Billing · Settings · Protobase'))

    await userEvent.click(nav.getByRole('link', { name: 'General' }))
    expect(await canvas.findByRole('heading', { name: 'Opening hours' })).toBeVisible()
  },
}

/** On a phone the tabs are a select, which opens the tab chosen. */
export const PhoneChecks: StoryObj = {
  ...Phone,
  name: 'Settings in tabs, on a phone (checks)',
  tags: ['play', '!dev', 'phone'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const select = await canvas.findByRole('combobox', { name: 'Tabs' })
    expect(canvas.queryByRole('navigation', { name: 'Tabs' })).toBeNull()
    await userEvent.selectOptions(select, 'Notifications')
    expect(await canvas.findByText('A message for every new repair.')).toBeVisible()
    expect(select).toHaveValue('notifications')
  },
}

/** A tab name the page has no tab for keeps the tabs, none of them current, and says so. */
export const UnknownTabChecks: StoryObj = {
  ...UnknownTab,
  name: 'A tab the page has not (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(await canvas.findByRole('alert')).toHaveTextContent('This page has no tab called payroll.')
    expect(within(canvas.getByRole('navigation', { name: 'Tabs' })).queryByRole('link', { current: 'page' })).toBeNull()
  },
}
