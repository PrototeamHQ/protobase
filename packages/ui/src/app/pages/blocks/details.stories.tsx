import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { createStaticSession } from '@protobase/client'
import { BooleanField, ChipField, DateField, Details, NumberField, Page, RecordCard, Summary, Text, TextField, UrlField, page } from '@protobase/layout'
import { f, resource, view } from '@protobase/schema'
import { App } from '../../app'
import { fakeApi } from '../../testing/fake-api'

const viewports = {
  phone390: { name: 'Phone 390', styles: { width: '390px', height: '844px' }, type: 'mobile' },
  desktop1280: { name: 'Desktop 1280', styles: { width: '1280px', height: '800px' }, type: 'desktop' },
} as const

const meta = { title: 'Composed pages/Details', parameters: { layout: 'fullscreen', viewport: { options: viewports } } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'story', email: 'story@example.test', name: 'Story User', role: 'admin' })

// A bike repair's page: one line that sums it up, which opens to the rest of its values

const repairs = resource('repairs')
  .table('repairs')
  .fields({
    id: f.integer().readOnly().filterable().sortable(),
    bike: f.text(),
    state: f.enum(['waiting', 'in_progress', 'done']),
    due_at: f.timestamp(),
    quote: f.decimal({ precision: 10, scale: 2 }),
    paid: f.boolean(),
    manual: f.text().optional(),
    note: f.text().optional(),
  })
  .primaryKey((r) => r.id)

const repairsView = view<typeof repairs>('repairs')
  .title((r) => r.bike)
  .names({ singular: 'Repair', plural: 'Repairs' })
  .fields((r) => ({ state: r.state.valueLabels({ waiting: 'Waiting', in_progress: 'In progress', done: 'Done' }) }))

const repair = page(
  'repair',
  Page({
    title: 'Repair',
    children: RecordCard({
      resource: 'repairs',
      recordKey: '1',
      title: 'Current repair',
      children: Details({
        children: [
          Summary({ children: [TextField({ source: 'bike' }), ' ', ChipField({ source: 'state' })] }),
          Text({ children: ['Due ', DateField({ source: 'due_at', showTime: true, options: { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' } }), ', quoted at ', NumberField({ source: 'quote', options: { style: 'currency', currency: 'EUR' } }), '.'] }),
          Text({ children: ['Paid: ', BooleanField({ source: 'paid', valueLabelFalse: 'Not yet' }), '. Manual: ', UrlField({ source: 'manual', content: 'Workshop manual' }), '. Note: ', TextField({ source: 'note', emptyText: 'none' })] }),
        ],
      }),
    }),
  }),
)

const Repair = () => {
  const [api] = useState(() =>
    fakeApi({
      resources: [repairs.toModel()],
      views: [repairsView.toModel()],
      pages: [repair.toModel()],
      rows: { repairs: [{ id: 1, bike: 'Gazelle Tour', state: 'in_progress', due_at: '2026-11-20T15:30:00Z', quote: '120.50', paid: false, manual: 'https://example.com/manual', note: null }] },
    }),
  )
  return (
    <div className="min-h-screen">
      <App client={api.client} auth={session} initialUrl="/repair" />
    </div>
  )
}

export const Desktop: StoryObj = { name: 'Inline fields in Details', globals: { viewport: { value: 'desktop1280' } }, render: () => <Repair /> }

export const Phone: StoryObj = { ...Desktop, name: 'Inline fields in Details, on a phone', globals: { viewport: { value: 'phone390' } } }

// Closed at first, the summary shows its values; a click opens it with no script of the page's own
const play: StoryObj['play'] = async ({ canvasElement }) => {
  const canvas = within(canvasElement)
  const summary = (await canvas.findByText('Gazelle Tour')).closest('summary')!
  const details = summary.closest('details')!
  await waitFor(() => expect(within(summary).getByText('In progress')).toBeVisible())
  expect(details.open).toBe(false)
  expect(canvas.getByText(/quoted at/)).not.toBeVisible()

  await userEvent.click(summary)
  expect(details.open).toBe(true)
  await waitFor(() => expect(canvas.getByText('€120.50')).toBeVisible())
  expect(canvas.getByText('20 Nov 2026, 15:30')).toBeVisible()
  expect(canvas.getByText('Not yet')).toBeVisible()
  expect(canvas.getByRole('link', { name: 'Workshop manual' })).toHaveAttribute('href', 'https://example.com/manual')
  expect(canvas.getByText('none')).toBeVisible()
}

export const DesktopChecks: StoryObj = { ...Desktop, name: 'Inline fields in Details (checks)', tags: ['play', '!dev'], play }

export const PhoneChecks: StoryObj = { ...Phone, name: 'Inline fields in Details, on a phone (checks)', tags: ['play', '!dev', 'phone'], play }
