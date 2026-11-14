import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { createStaticSession } from '@protobase/client'
import { Field, Page, ReferenceField, SelectInput, Table, page } from '@protobase/layout'
import { f, resource, view } from '@protobase/schema'
import { App } from '../../app'
import { fakeApi } from '../../testing/fake-api'

const viewports = {
  phone390: { name: 'Phone 390', styles: { width: '390px', height: '844px' }, type: 'mobile' },
  desktop1280: { name: 'Desktop 1280', styles: { width: '1280px', height: '800px' }, type: 'desktop' },
} as const

const meta = { title: 'Composed pages/Page parameters', parameters: { layout: 'fullscreen', viewport: { options: viewports } } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'story', email: 'story@example.test', name: 'Story User', role: 'admin' })

// Claims of the last 7 or 30 days, chosen in the page's address, and the chosen claim's details under its table

const workers = resource('workers')
  .table('workers')
  .fields({ id: f.integer().readOnly().filterable().sortable(), name: f.text() })
  .primaryKey((r) => r.id)
const claims = resource('task_claims')
  .table('task_claims')
  .fields({
    id: f.integer().readOnly().filterable().sortable(),
    title: f.text(),
    worker_id: f.relation('workers').filterable(),
    claimed_at: f.timestamp().filterable().sortable(),
    status: f.text().filterable(),
  })
  .primaryKey((r) => r.id)

const views = [view<typeof workers>('workers').title((r) => r.name), view<typeof claims>('task_claims').title((r) => r.title).list((r) => ({ columns: [r.title, r.status, r.claimed_at] }))]

const recent = page(
  'claims',
  Page({
    title: 'Claims',
    children: [
      SelectInput({ source: 'window', label: 'Window', choices: [{ id: '7d', name: 'Last 7 days' }, { id: '30d', name: 'Last 30 days' }], defaultValue: '7d' }),
      Table({
        resource: 'task_claims',
        title: 'Claims of the last {{@params.window}}',
        filter: 'claimed_at >= now() - {{@params.window}}',
        sort: 'claimed_at desc',
        columns: ['title', 'status', 'claimed_at'],
        select: 'claim',
        children: [Field({ source: 'title' }), Field({ source: 'status' }), ReferenceField({ source: 'worker_id', reference: 'workers' })],
      }),
    ],
  }),
)

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString()

const rows = () => ({
  workers: [
    { id: 3, name: 'Ann' },
    { id: 4, name: 'Bo' },
  ],
  task_claims: [
    { id: 10, title: 'Fix the login', worker_id: 3, claimed_at: daysAgo(2), status: 'open' },
    { id: 11, title: 'Write the notes', worker_id: 4, claimed_at: daysAgo(20), status: 'done' },
  ],
})

const Claims = () => {
  const [client] = useState(() => fakeApi({ resources: [workers.toModel(), claims.toModel()], views: views.map((entry) => entry.toModel()), pages: [recent.toModel()], rows: rows() }).client)
  return (
    <div className="min-h-screen">
      <App client={client} auth={session} initialUrl="/claims" />
    </div>
  )
}

export const Desktop: StoryObj = { name: 'A window and a chosen claim', globals: { viewport: { value: 'desktop1280' } }, render: () => <Claims /> }

export const Phone: StoryObj = { ...Desktop, name: 'A window and a chosen claim, on a phone', globals: { viewport: { value: 'phone390' } } }

// The default window reads one claim; the other choice is a link that reads both; a row is a link that shows its details
const play: StoryObj['play'] = async ({ canvasElement }) => {
  const canvas = within(canvasElement)
  const table = within(await canvas.findByRole('region', { name: 'Claims of the last 7d' }))
  expect(await table.findByText('Fix the login')).toBeVisible()
  expect(table.queryByText('Write the notes')).toBeNull()

  await userEvent.click(canvas.getByRole('button', { name: 'Window: Last 7 days' }))
  const month = canvas.getByRole('menuitemradio', { name: 'Last 30 days' })
  expect(month).toHaveAttribute('href', '/claims?window=30d')
  expect(canvas.getByRole('menuitemradio', { name: 'Last 7 days' })).toHaveAttribute('href', '/claims')
  await userEvent.click(month)

  const wider = within(await canvas.findByRole('region', { name: 'Claims of the last 30d' }))
  const row = await wider.findByRole('link', { name: /Write the notes/ })
  expect(row).toHaveAttribute('href', '/claims?window=30d&claim=11')
  await userEvent.click(row)
  await waitFor(() => expect(wider.getByRole('link', { name: 'Bo' })).toBeVisible())
  // Its status once in the table and once in the details
  expect(wider.getAllByText('done')).toHaveLength(2)
}

export const DesktopChecks: StoryObj = { ...Desktop, name: 'A window and a chosen claim (checks)', tags: ['play', '!dev'], play }

export const PhoneChecks: StoryObj = { ...Phone, name: 'A window and a chosen claim, on a phone (checks)', tags: ['play', '!dev', 'phone'], play }
