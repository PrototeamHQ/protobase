import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { createStaticSession } from '@protobase/client'
import { Chart, Grid, Page, page } from '@protobase/layout'
import type { ViewModel } from '@protobase/schema'
import { App } from '../app'
import { viewerZone, zoneOffset } from '../../format/zone'
import { salesResources, salesRows, salesViews } from '../pages/guide/sales-domain'
import { fakeApi } from '../testing/fake-api'

const meta = { title: 'App/Charts', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'story', email: 'sam@veldhuis.example', name: 'Sam Veldhuis', role: 'admin' })

const charts = page(
  'charts',
  Page({
    title: 'Sales charts',
    children: Grid({
      columns: 2,
      children: [
        Chart({ title: 'Orders by status', resource: 'orders', groupBy: 'status', type: 'donut' }),
        Chart({ title: 'Revenue by customer', resource: 'orders', groupBy: 'company_id', sum: 'total', filter: 'status != "cancelled"' }),
        Chart({ title: 'Invoiced per month', resource: 'invoices', groupBy: 'issued_at', granularity: 'month', range: '1y', type: 'line', sum: 'total', span: 2 }),
        Chart({ title: 'Invoiced per month by status', resource: 'invoices', groupBy: 'issued_at', splitBy: 'status', sum: 'total', granularity: 'month', range: '1y', span: 2 }),
      ],
    }),
  }),
)

// The orders list with a donut of its statuses above it, in place of the chart over time.
const withGroupChart = salesViews.map((view): ViewModel => (view.resource === 'orders' ? { ...view, chart: { groupBy: 'status', type: 'bar', sum: 'total', limit: 10 } } : view))

const ChartsApp = ({ url, views = salesViews, rows = salesRows }: { url: string; views?: ViewModel[]; rows?: typeof salesRows }) => {
  const [api] = useState(() => fakeApi({ resources: salesResources, views, pages: [charts.toModel()], rows }))
  return (
    <div className="h-screen">
      <App client={api.client} auth={session} initialUrl={url} workspace="Veldhuis Supply" />
    </div>
  )
}

export const ChartBlocks: StoryObj = {
  name: 'Chart blocks on a page',
  render: () => <ChartsApp url="/charts" />,
}

export const ChartBlocksChecks: StoryObj = {
  ...ChartBlocks,
  name: 'Chart blocks on a page (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const donut = within(await canvas.findByRole('region', { name: 'Orders by status' }))
    const delivered = await donut.findByRole('link', { name: /Delivered/ })
    expect(delivered).toHaveTextContent('Delivered444%')
    expect(delivered).toHaveAttribute('href', `/orders?${new URLSearchParams({ filter: 'status = "delivered"' })}`)
    const revenue = within(await canvas.findByRole('region', { name: 'Revenue by customer' }))
    const rows = await revenue.findAllByRole('link')
    expect(rows.map((row) => row.textContent)).toEqual(['Hollis & Rowe€12,650.00', 'Veldhuis Bouw€6,320.00', 'Brandt Logistik€5,590.50'])
    expect(rows[0]).toHaveAttribute('href', `/orders?${new URLSearchParams({ filter: '(status != "cancelled") AND company_id = 3' })}`)
    const invoiced = await canvas.findByRole('region', { name: 'Invoiced per month' })
    await within(invoiced).findByText('Jul 26')
    expect(invoiced.querySelector('.recharts-line')).not.toBeNull()
    const split = within(await canvas.findByRole('region', { name: 'Invoiced per month by status' }))
    const paid = await split.findByRole('link', { name: 'Paid' })
    expect(paid).toHaveAttribute('href', `/invoices?${new URLSearchParams({ filter: 'status = "paid"' })}`)
  },
}

export const ListGroupChart: StoryObj = {
  name: 'A list chart per value',
  render: () => <ChartsApp url="/orders" views={withGroupChart} />,
}

export const ListGroupChartChecks: StoryObj = {
  ...ListGroupChart,
  name: 'A list chart per value (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const chart = within(await canvas.findByRole('region', { name: 'Total by status' }))
    const bars = await chart.findAllByRole('link')
    expect(bars.map((bar) => bar.textContent)).toEqual(['Delivered€17,510.00', 'Shipped€4,520.00', 'Draft€1,550.50', 'Confirmed€980.00', 'Cancelled€150.00'])
  },
}

// The orders list with its orders per day above it: two orders three days ago and three today, on the viewer's clock as the chart reads it
const withPeriodChart = salesViews.map((view): ViewModel => (view.resource === 'orders' ? { ...view, chart: { field: 'created_at', range: '30d', granularity: 'day' } } : view))
const viewerNow = Date.now() + zoneOffset(Date.now(), viewerZone())
const recentOrders = salesRows.orders.slice(0, 5).map((order, index) => ({ ...order, created_at: new Date(viewerNow - (index < 2 ? 3 : 0) * 86_400_000).toISOString().slice(0, 19) }))

export const ListPeriodChart: StoryObj = {
  name: 'A list chart over time',
  render: () => <ChartsApp url="/orders" views={withPeriodChart} rows={{ ...salesRows, orders: recentOrders }} />,
}

export const ListPeriodChartChecks: StoryObj = {
  ...ListPeriodChart,
  name: 'A list chart over time (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const section = (await within(canvasElement).findByRole('heading', { name: 'Orders created' })).closest('section')!
    await waitFor(() => expect(within(section).getAllByRole('row')).toHaveLength(31))
    // Today's bar, still filling up, is outlined with a dash, the days before it are not
    const outlines = [...section.querySelectorAll('.recharts-bar-rectangle path')].map((bar) => bar.getAttribute('stroke-dasharray'))
    expect(outlines.filter((outline) => outline !== null)).toEqual(['3 2'])
    expect(outlines.at(-1)).toBe('3 2')
    // A screen reader reads every day and its count in a table, the running one as today
    const rows = within(section).getAllByRole('row').map((row) => row.textContent)
    expect(rows[0]).toBe('PeriodCount')
    expect(rows.at(-4)).toMatch(/^\d+ \w+ \d{4}2$/)
    expect(rows.at(-1)).toBe('Today3')
    // The chart takes focus and shows the first day's tooltip; the arrow keys move it from day to day and Escape closes it
    const tooltip = () => section.querySelector('.recharts-tooltip-wrapper')?.textContent ?? ''
    const chart = within(section).getByRole('application', { name: 'Chart: use the left and right arrow keys to read each period' })
    chart.focus()
    expect(chart).toHaveStyle({ outlineStyle: 'solid' })
    await waitFor(() => expect(tooltip()).toBe(rows[1]))
    await userEvent.keyboard('{ArrowRight}')
    await waitFor(() => expect(tooltip()).toBe(rows[2]))
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(tooltip()).toBe(''))
    await userEvent.keyboard('{ArrowLeft}')
    await waitFor(() => expect(tooltip()).toBe(rows[1]))
  },
}
