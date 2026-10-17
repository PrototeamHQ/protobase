import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, within } from 'storybook/test'
import { createStaticSession } from '@protobase/client'
import { Chart, Grid, Page, page } from '@protobase/layout'
import type { ViewModel } from '@protobase/schema'
import { App } from '../app'
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
      ],
    }),
  }),
)

// The orders list with a donut of its statuses above it, in place of the chart over time.
const withGroupChart = salesViews.map((view): ViewModel => (view.resource === 'orders' ? { ...view, chart: { groupBy: 'status', type: 'bar', sum: 'total', limit: 10 } } : view))

const ChartsApp = ({ url, views = salesViews }: { url: string; views?: ViewModel[] }) => {
  const [api] = useState(() => fakeApi({ resources: salesResources, views, pages: [charts.toModel()], rows: salesRows }))
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
