import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { createStaticSession } from '@protobase/client'
import { Page, Table, page } from '@protobase/layout'
import { f, resource, view } from '@protobase/schema'
import { App } from '../../app'
import { embeddedDisplayKey } from '../../embedded-list/embedded-display'
import { fakeApi } from '../../testing/fake-api'

const viewports = { phone390: { name: 'Phone 390', styles: { width: '390px', height: '844px' }, type: 'mobile' } } as const

const meta = { title: 'Composed pages/Table display', parameters: { layout: 'fullscreen', viewport: { options: viewports } } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'story', email: 'story@example.test', name: 'Story User', role: 'admin' })

const objectives = resource('objectives')
  .table('objectives')
  .fields({ id: f.integer().readOnly().filterable().sortable(), rank: f.integer().sortable(), title: f.text(), points: f.integer(), verdict: f.enum(['on_track', 'at_risk']) })
  .primaryKey((r) => r.id)

// A view with a cards display that leaves the verdict out
const objectivesView = view<typeof objectives>('objectives')
  .title((r) => r.title)
  .names({ singular: 'Objective', plural: 'Objectives' })
  .fields((r) => ({ verdict: r.verdict.valueLabels({ on_track: 'On track', at_risk: 'At risk' }) }))
  .list((r, d) => ({ columns: [r.rank, r.title, r.points, r.verdict], displays: [d.cards({ meta: [r.points] })] }))

// The same objectives twice: set to the table, and with no display set
const overview = page(
  'overview',
  Page({
    title: 'Overview',
    children: [
      Table({ title: 'Set to table', resource: 'objectives', display: 'table', columns: ['rank', { name: 'title', priority: 2 }, 'points', { name: 'verdict', priority: 1 }] }),
      Table({ title: 'Unset', resource: 'objectives', columns: ['rank', 'title', 'points', 'verdict'] }),
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

// The places the two tables keep a viewer's pick under, cleared so each story starts with none
const places = [embeddedDisplayKey('page:objectives:Set to table:'), embeddedDisplayKey('page:objectives:Unset:')]
const forgetPicks = () => places.forEach((key) => localStorage.removeItem(key))

// The block of the table with this title
const section = (canvasElement: HTMLElement, title: string) => within(canvasElement).findByRole('region', { name: title })

// The column ids a section's table header shows, or none when it shows no table
const headers = (element: HTMLElement) => {
  const header = element.querySelector('[role=grid] [role=row]')
  return header ? [...header.querySelectorAll('[data-col-id]')].map((cell) => cell.getAttribute('data-col-id')) : undefined
}

const cards = (element: HTMLElement) => element.querySelector('ul[aria-label=Objectives]')

export const Phone: StoryObj = { name: 'At phone width', globals: { viewport: { value: 'phone390' } }, beforeEach: forgetPicks, render: () => <Overview /> }

/** On a phone, a table set to `display: 'table'` stays a table with its priority columns; one with no display set opens in cards. */
export const PhoneChecks: StoryObj = {
  ...Phone,
  name: 'At phone width (checks)',
  tags: ['play', 'touch', '!dev'],
  play: async ({ canvasElement }) => {
    const set = await section(canvasElement, 'Set to table')
    const unset = await section(canvasElement, 'Unset')
    await waitFor(() => expect(headers(set)).toEqual(['title', 'verdict']))
    await waitFor(() => expect(cards(unset)).not.toBeNull())
    expect(headers(unset)).toBeUndefined()
  },
}

/** On a phone, the viewer's pick of cards wins over the table the block is set to. */
export const PhonePickChecks: StoryObj = {
  ...Phone,
  name: 'At phone width, cards picked (checks)',
  tags: ['play', 'touch', '!dev'],
  play: async ({ canvasElement }) => {
    const set = await section(canvasElement, 'Set to table')
    await waitFor(() => expect(headers(set)).toEqual(['title', 'verdict']))
    await userEvent.click(within(set).getByRole('button', { name: 'Display: Table' }))
    await userEvent.click(within(set).getByRole('menuitemradio', { name: 'Cards' }))
    await waitFor(() => expect(cards(set)).not.toBeNull())
    expect(headers(set)).toBeUndefined()
  },
}

export const Desktop: StoryObj = { name: 'At desktop width', beforeEach: forgetPicks, render: () => <Overview /> }

/** A desktop shows both as tables with every column. */
export const DesktopChecks: StoryObj = {
  ...Desktop,
  name: 'At desktop width (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const set = await section(canvasElement, 'Set to table')
    const unset = await section(canvasElement, 'Unset')
    await waitFor(() => expect(headers(set)).toEqual(['rank', 'title', 'points', 'verdict']))
    await waitFor(() => expect(headers(unset)).toEqual(['rank', 'title', 'points', 'verdict']))
  },
}
