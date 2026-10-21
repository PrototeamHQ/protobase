import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { createStaticSession } from '@protobase/client'
import { f, l, resource, view } from '@protobase/schema'
import { App } from '../app'
import { fakeApi } from '../testing/fake-api'

const meta = { title: 'Record page/Charts of related records', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'ada', email: 'ada@hosts.example', name: 'Ada', role: 'admin' })

const hosts = resource('hosts').table('hosts').fields({ id: f.integer(), name: f.text() }).primaryKey((r) => r.id)
const samples = resource('host_samples')
  .table('host_samples')
  .fields({
    id: f.integer(),
    host_id: f.relation('hosts').filterable(),
    sampled_at: f.timestamp().filterable().sortable(),
    cpu: f.decimal({ precision: 5, scale: 2 }),
    net_in: f.bigint(),
    net_out: f.bigint(),
  })
  .primaryKey((r) => r.id)

const hostsView = view<typeof hosts>('hosts')
  .title((r) => r.name)
  .recordMode('read')
  .layout((r) => [
    l.section('Host', [r.name]),
    l.chart('CPU', { resource: 'host_samples', field: 'host_id', at: 'sampled_at', series: ['cpu'] }),
    l.chart('Network', { resource: 'host_samples', field: 'host_id', at: 'sampled_at', series: ['net_in', 'net_out'], help: 'Bytes per second, in and out.' }),
  ])
const samplesView = view<typeof samples>('host_samples').fields((r) => ({ cpu: r.cpu.label('CPU').suffix(' %').decimals(1), net_in: r.net_in.label('In'), net_out: r.net_out.label('Out') }))

// An hour and a half of samples a minute apart, with ten minutes missing while the agent was down
const start = Date.parse('2026-08-01T09:00:00Z')
const sampleRows = Array.from({ length: 90 }, (_, minute) => minute)
  .filter((minute) => minute < 40 || minute >= 50)
  .map((minute) => ({
    id: minute + 1,
    host_id: 1,
    sampled_at: new Date(start + minute * 60_000).toISOString(),
    cpu: Math.round((30 + 20 * Math.sin(minute / 8) + (minute % 7)) * 100) / 100,
    net_in: 4_000_000 + 1_500_000 * Math.round(Math.cos(minute / 5) * 10) / 10,
    net_out: 1_200_000 + 400_000 * (minute % 5),
  }))

const Host = () => {
  const [api] = useState(() =>
    fakeApi({ resources: [hosts.toModel(), samples.toModel()], views: [hostsView.toModel(), samplesView.toModel()], rows: { hosts: [{ id: 1, name: 'node-1' }], host_samples: sampleRows } }),
  )
  return (
    <div className="h-screen">
      <App client={api.client} auth={session} initialUrl="/hosts/1" />
    </div>
  )
}

export const RecordCharts: StoryObj = { name: 'Samples over the last hour, day or week', render: () => <Host /> }

const section = async (canvasElement: HTMLElement, title: string) => (await within(canvasElement).findByRole('heading', { name: title })).closest('section')!

export const RecordChartsChecks: StoryObj = {
  ...RecordCharts,
  name: 'Samples over the last hour, day or week (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const cpu = await section(canvasElement, 'CPU')
    const network = await section(canvasElement, 'Network')
    // A line per series, a legend only where there are several
    await waitFor(() => expect(cpu.querySelectorAll('.recharts-line')).toHaveLength(1))
    await waitFor(() => expect(network.querySelectorAll('.recharts-line')).toHaveLength(2))
    expect(within(network).getByText('In')).toBeVisible()
    expect(within(network).getByText('Bytes per second, in and out.')).toBeVisible()
    expect(within(cpu).queryByRole('listitem')).toBeNull()

    // The range and the measure switch, each section on its own
    const hour = within(cpu).getByRole('button', { name: 'Hour' })
    expect(hour).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(within(cpu).getByRole('button', { name: 'Day' }))
    await waitFor(() => expect(within(cpu).getByRole('button', { name: 'Day' })).toHaveAttribute('aria-pressed', 'true'))
    await userEvent.click(within(cpu).getByRole('button', { name: 'Maximum' }))
    await waitFor(() => expect(cpu.querySelectorAll('.recharts-line')).toHaveLength(1))
    expect(within(network).getByRole('button', { name: 'Hour' })).toHaveAttribute('aria-pressed', 'true')
  },
}
