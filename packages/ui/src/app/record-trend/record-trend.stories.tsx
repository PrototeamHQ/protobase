import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { createStaticSession } from '@protobase/client'
import { f, l, resource, view } from '@protobase/schema'
import { App } from '../app'
import { zoneOffset, viewerZone } from '../../format/zone'
import { fakeApi } from '../testing/fake-api'

const meta = { title: 'Record page/Trends of related records', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'ada', email: 'ada@tasks.example', name: 'Ada', role: 'admin' })

const objectives = resource('objectives').table('objectives').fields({ id: f.integer(), name: f.text() }).primaryKey((r) => r.id)
const tasks = resource('tasks')
  .table('tasks')
  .fields({ id: f.integer(), objective_id: f.relation('objectives').filterable(), title: f.text(), shipped_at: f.timestamp().optional().filterable().sortable() })
  .primaryKey((r) => r.id)

const objectivesView = view<typeof objectives>('objectives')
  .title((r) => r.name)
  .recordMode('read')
  .layout((r) => [
    l.section('Objective', [r.name]),
    l.trend('Shipped per week', { resource: 'tasks', field: 'objective_id', at: 'shipped_at', range: '90d', granularity: 'week', help: 'Counted by the day each task shipped.' }),
    l.related('Tasks', { resource: 'tasks', field: 'objective_id', columns: ['title', 'shipped_at'] }),
  ])

// The objective's tasks shipped 2, 1 and 3 in three weeks, Monday to Sunday; another objective's 5 and an unshipped one are not counted
const shipped = (objective: number, at: string | null, index: number) => ({ id: index + 1, objective_id: objective, title: `Task ${index + 1}`, shipped_at: at })
const taskRows = [
  [1, '2026-10-05T09:00:00Z'],
  [1, '2026-10-11T22:00:00Z'],
  [1, '2026-10-14T10:00:00Z'],
  [1, '2026-10-19T08:00:00Z'],
  [1, '2026-10-21T12:00:00Z'],
  [1, '2026-10-25T18:00:00Z'],
  [1, null],
  ...Array.from({ length: 5 }, () => [2, '2026-10-13T09:00:00Z']),
].map(([objective, at], index) => shipped(objective as number, at as string | null, index))

const Objective = ({ rows = taskRows }: { rows?: typeof taskRows }) => {
  const [api] = useState(() =>
    fakeApi({
      resources: [objectives.toModel(), tasks.toModel()],
      views: [objectivesView.toModel()],
      rows: { objectives: [{ id: 1, name: 'Faster checkout' }, { id: 2, name: 'Fewer refunds' }], tasks: rows },
    }),
  )
  return (
    <div className="h-screen">
      <App client={api.client} auth={session} initialUrl="/objectives/1" />
    </div>
  )
}

export const RecordTrend: StoryObj = { name: 'Shipped tasks per week', render: () => <Objective /> }

export const RecordTrendChecks: StoryObj = {
  ...RecordTrend,
  name: 'Shipped tasks per week (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const section = (await within(canvasElement).findByRole('heading', { name: 'Shipped per week' })).closest('section')!
    expect(within(section).getByText('Counted by the day each task shipped.')).toBeVisible()
    // The total of the bars, over the range; the other objective's tasks and the unshipped one are not in it
    await waitFor(() => expect(within(section).getByText('6 in the last 90 days')).toBeVisible())
    // One bar a week of the objective's own tasks, as tall as its count: 2, 1 and 3
    await waitFor(() => expect(section.querySelectorAll('.recharts-bar-rectangle')).toHaveLength(3))
    const heights = [...section.querySelectorAll('.recharts-bar-rectangle')].map((bar) => bar.getBoundingClientRect().height)
    expect(heights.map((height) => Math.round((height / heights[1]!) * 10) / 10)).toEqual([2, 1, 3])
  },
}

// One task shipped eight days ago, in a week gone by, and two this week, written on the viewer's clock as the chart reads it
const viewerNow = Date.now() + zoneOffset(Date.now(), viewerZone())
const thisWeekRows = [viewerNow - 8 * 86_400_000, viewerNow, viewerNow].map((at, index) => shipped(1, new Date(at).toISOString().slice(0, 19), index))

export const RunningWeek: StoryObj = { name: 'This week still running', render: () => <Objective rows={thisWeekRows} /> }

export const RunningWeekChecks: StoryObj = {
  ...RunningWeek,
  name: 'This week still running (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const section = (await within(canvasElement).findByRole('heading', { name: 'Shipped per week' })).closest('section')!
    await waitFor(() => expect(section.querySelectorAll('.recharts-bar-rectangle')).toHaveLength(2))
    // The running week's bar is outlined with a dash, the finished one is not
    const outlines = [...section.querySelectorAll('.recharts-bar-rectangle path')].map((bar) => bar.getAttribute('stroke-dasharray'))
    expect(outlines).toEqual([null, '3 2'])
    // A screen reader reads every week and its count in a table, the running one up to today
    const rows = within(section).getAllByRole('row').map((row) => row.textContent)
    expect(rows[0]).toBe('PeriodCount')
    expect(rows[1]).toMatch(/^\d+( \w+)?( \d{4})?\s*–\s*\d+ \w+ \d{4}1$/)
    expect(rows[2]).toMatch(/^\d+ \w+( \d{4})? to today2$/)
    // The chart takes focus and shows the first week's tooltip; the right arrow moves it to this week and Escape closes it
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
