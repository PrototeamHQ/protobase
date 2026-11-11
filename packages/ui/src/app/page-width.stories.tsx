import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, within } from 'storybook/test'
import { createStaticSession } from '@protobase/client'
import { Card, Grid, Page, page, type PageProps } from '@protobase/layout'
import type { PageWidth } from '@protobase/schema'
import { customers, repairs } from '../../../../docs-examples/bike-shop/data'
import { customerRows, repairRows } from '../../../../docs-examples/bike-shop/rows'
import { customersView, repairsView } from '../../../../docs-examples/bike-shop/step-5'
import { App } from './app'
import { fakeApi } from './testing/fake-api'

const phone360 = { name: 'Phone 360', styles: { width: '360px', height: '740px' }, type: 'mobile' }

const meta = { title: 'Pages/Page width', parameters: { layout: 'fullscreen', viewport: { options: { phone360 } } } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'pip', email: 'pip@bikeshop.example', name: 'Pip', role: 'admin' })

// The shop's day at a glance, as a dashboard of cards, at the page's `width`
const today = (width?: PageProps['width']) =>
  page(
    'today',
    Page({
      title: 'Today',
      width,
      children: Grid({
        columns: 4,
        children: [
          Card({ title: 'Booked in', children: 'Three bikes.' }),
          Card({ title: 'Waiting for parts', children: 'One bike.' }),
          Card({ title: 'Ready for pickup', children: 'Two bikes.' }),
          Card({ title: 'Collected', children: 'Four bikes.' }),
        ],
      }),
    }),
  )

/** The shop at `start`, its composed page and its repairs' record pages at `width`. */
const Shop = ({ start, width }: { start: string; width?: PageWidth }) => {
  const [api] = useState(() =>
    fakeApi({
      resources: [customers.toModel(), repairs.toModel()],
      views: [customersView.toModel(), (width ? repairsView.recordWidth(width) : repairsView).toModel()],
      pages: [today(width).toModel()],
      rows: { customers: customerRows, repairs: repairRows },
    }),
  )
  return (
    <div className="min-h-screen">
      <App client={api.client} auth={session} initialUrl={start} workspace="Pip's bike shop" />
    </div>
  )
}

export const FullWidthPage: StoryObj = { name: 'A dashboard across the full width', render: () => <Shop start="/today" width="full" /> }

export const FullWidthRecord: StoryObj = { name: 'A repair across the full width', render: () => <Shop start="/repairs/1" width="full" /> }

// The content pane beside the sidebar, and the padding the page keeps inside it on a desktop
const pane = (canvasElement: HTMLElement) => canvasElement.querySelector('main')!.getBoundingClientRect()
const padding = 40

// A composed page's heading spans its page from edge to edge, so it shows how wide the page is
const pageHeading = async (canvasElement: HTMLElement) => (await within(canvasElement).findByRole('heading', { level: 1, name: 'Today' })).getBoundingClientRect()

// A record page's main column and its sidebar cards beside it
const recordColumns = async (canvasElement: HTMLElement) => {
  await within(canvasElement).findByRole('heading', { name: 'R-301' })
  const aside = canvasElement.querySelector('main aside')!
  return { main: aside.previousElementSibling!.getBoundingClientRect(), aside: aside.getBoundingClientRect() }
}

export const FullWidthPageChecks: StoryObj = {
  ...FullWidthPage,
  name: 'A dashboard across the full width (checks)',
  tags: ['play', 'wide', '!dev'],
  play: async ({ canvasElement }) => {
    const heading = await pageHeading(canvasElement)
    expect(heading.left).toBeCloseTo(pane(canvasElement).left + padding, 0)
    expect(heading.right).toBeCloseTo(pane(canvasElement).right - padding, 0)
  },
}

export const ColumnPageChecks: StoryObj = {
  name: 'A dashboard in the centred column (checks)',
  tags: ['play', 'wide', '!dev'],
  render: () => <Shop start="/today" />,
  play: async ({ canvasElement }) => {
    const heading = await pageHeading(canvasElement)
    expect(heading.width).toBeCloseTo(1200 - 2 * padding, 0)
    expect(heading.left - pane(canvasElement).left).toBeCloseTo(pane(canvasElement).right - heading.right, 0)
  },
}

export const FullWidthRecordChecks: StoryObj = {
  ...FullWidthRecord,
  name: 'A repair across the full width, its sidebar cards beside it (checks)',
  tags: ['play', 'wide', '!dev'],
  play: async ({ canvasElement }) => {
    const { main, aside } = await recordColumns(canvasElement)
    expect(main.left).toBeCloseTo(pane(canvasElement).left + padding, 0)
    expect(aside.right).toBeCloseTo(pane(canvasElement).right - padding, 0)
    expect(aside.left).toBeGreaterThan(main.right)
    expect(aside.top).toBeCloseTo(main.top, 0)
  },
}

export const ColumnRecordChecks: StoryObj = {
  name: 'A repair in the centred column (checks)',
  tags: ['play', 'wide', '!dev'],
  render: () => <Shop start="/repairs/1" />,
  play: async ({ canvasElement }) => {
    const { main, aside } = await recordColumns(canvasElement)
    expect(aside.right - main.left).toBeCloseTo(1100 - 2 * padding, 0)
  },
}

// On a phone the column is narrower than the screen either way: the pages keep the phone's padding, and the sidebar
// cards sit below the record's sections
const phonePadding = 16

export const PageOnAPhoneChecks: StoryObj = {
  ...FullWidthPage,
  name: 'A full-width dashboard on a phone (checks)',
  tags: ['play', 'phone', '!dev'],
  globals: { viewport: { value: 'phone360' } },
  play: async ({ canvasElement }) => {
    const heading = await pageHeading(canvasElement)
    expect(heading.left).toBeCloseTo(pane(canvasElement).left + phonePadding, 0)
    expect(heading.right).toBeCloseTo(pane(canvasElement).right - phonePadding, 0)
  },
}

export const RecordOnAPhoneChecks: StoryObj = {
  ...FullWidthRecord,
  name: 'A full-width repair on a phone (checks)',
  tags: ['play', 'phone', '!dev'],
  globals: { viewport: { value: 'phone360' } },
  play: async ({ canvasElement }) => {
    const { main, aside } = await recordColumns(canvasElement)
    expect(main.left).toBeCloseTo(pane(canvasElement).left + phonePadding, 0)
    expect(main.right).toBeCloseTo(pane(canvasElement).right - phonePadding, 0)
    expect(aside.top).toBeGreaterThan(main.bottom)
  },
}
