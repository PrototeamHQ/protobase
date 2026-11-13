import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, waitFor } from 'storybook/test'
import { createStaticSession } from '@protobase/client'
import { Page, Table, page } from '@protobase/layout'
import { f, resource, view } from '@protobase/schema'
import { App } from '../../app'
import { fakeApi } from '../../testing/fake-api'

const viewports = { phone390: { name: 'Phone 390', styles: { width: '390px', height: '844px' }, type: 'mobile' } } as const

const meta = { title: 'Composed pages/Table columns', parameters: { layout: 'fullscreen', viewport: { options: viewports } } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'story', email: 'story@example.test', name: 'Story User', role: 'admin' })

const objectives = resource('objectives')
  .table('objectives')
  .fields({ id: f.integer().readOnly().filterable().sortable(), rank: f.integer().sortable(), title: f.text(), points: f.integer(), verdict: f.enum(['on_track', 'at_risk']) })
  .primaryKey((r) => r.id)

const objectivesView = view<typeof objectives>('objectives')
  .title((r) => r.title)
  .names({ singular: 'Objective', plural: 'Objectives' })
  .fields((r) => ({ verdict: r.verdict.valueLabels({ on_track: 'On track', at_risk: 'At risk' }) }))

// The same objectives twice: with priorities given, and with priorities derived from the columns
const overview = page(
  'overview',
  Page({
    title: 'Overview',
    children: [
      Table({ title: 'Ranked', resource: 'objectives', columns: ['rank', { name: 'title', priority: 2 }, 'points', { name: 'verdict', priority: 1 }] }),
      Table({ title: 'Derived', resource: 'objectives', columns: ['rank', 'points', 'title', 'id', 'verdict'] }),
    ],
  }),
)

const rows = () => ({
  objectives: [
    { id: 1, rank: 1, title: 'Tables fit a phone', points: 8, verdict: 'on_track' },
    { id: 2, rank: 2, title: 'Text for every block', points: 5, verdict: 'at_risk' },
  ],
})

const Overview = () => {
  const [api] = useState(() => fakeApi({ resources: [objectives.toModel()], views: [objectivesView.toModel()], pages: [overview.toModel()], rows: rows() }))
  return (
    <div className="min-h-screen">
      <App client={api.client} auth={session} initialUrl="/overview" />
    </div>
  )
}

// The column ids each table's header shows, in order
const headers = (canvasElement: HTMLElement) =>
  [...canvasElement.querySelectorAll('[role=grid]')].map((grid) => [...grid.querySelectorAll('[role=row]')][0]!.querySelectorAll('[data-col-id]')).map((cells) => [...cells].map((cell) => cell.getAttribute('data-col-id')))

export const Phone: StoryObj = { name: 'At phone width', globals: { viewport: { value: 'phone390' } }, render: () => <Overview /> }

/** A phone shows the columns given a priority, and without priorities the title, the enum and the first other column. */
export const PhoneChecks: StoryObj = {
  ...Phone,
  name: 'At phone width (checks)',
  tags: ['play', 'touch', '!dev'],
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(headers(canvasElement)).toEqual([
      ['title', 'verdict'],
      ['rank', 'title', 'verdict'],
    ]))
  },
}

export const Desktop: StoryObj = { name: 'At desktop width', render: () => <Overview /> }

/** A desktop shows every column. */
export const DesktopChecks: StoryObj = {
  ...Desktop,
  name: 'At desktop width (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(headers(canvasElement)).toEqual([
      ['rank', 'title', 'points', 'verdict'],
      ['rank', 'points', 'title', 'id', 'verdict'],
    ]))
  },
}
