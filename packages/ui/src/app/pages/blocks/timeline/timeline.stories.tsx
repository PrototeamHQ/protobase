import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { createStaticSession } from '@protobase/client'
import { Field, Page, ReferenceField, Timeline, page } from '@protobase/layout'
import { f, resource, view } from '@protobase/schema'
import { App } from '../../../app'
import { fakeApi } from '../../../testing/fake-api'

const viewports = {
  phone390: { name: 'Phone 390', styles: { width: '390px', height: '844px' }, type: 'mobile' },
  desktop1280: { name: 'Desktop 1280', styles: { width: '1280px', height: '800px' }, type: 'desktop' },
} as const

const meta = { title: 'Composed pages/Timeline', parameters: { layout: 'fullscreen', viewport: { options: viewports } } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'story', email: 'story@example.test', name: 'Story User', role: 'admin' })

// Three projects, each with two tasks, each task's time cut into phases, the waits striped; a task chosen shows its details

const tasks = resource('tasks')
  .table('tasks')
  .fields({ id: f.integer().readOnly().filterable().sortable(), title: f.text() })
  .primaryKey((r) => r.id)
const phases = resource('phases')
  .table('phases')
  .fields({
    id: f.integer().readOnly().filterable().sortable(),
    project: f.text().filterable(),
    task_id: f.relation('tasks').filterable(),
    phase: f.enum(['build', 'review', 'ci', 'land']),
    started_at: f.timestamp().filterable().sortable(),
    ended_at: f.timestamp().optional(),
    note: f.text().optional(),
  })
  .primaryKey((r) => r.id)

const views = [
  view<typeof tasks>('tasks').title((r) => r.title),
  view<typeof phases>('phases').fields((r) => ({
    project: r.project.label('Project'),
    task_id: r.task_id.label('Task'),
    phase: r.phase.label('Phase').valueLabels({ build: 'Building', review: 'In review', ci: 'Waiting for CI', land: 'Landing' }).valueColors({ build: 'blue', ci: 'amber', land: 'green' }).waitingValues(['ci']),
  })),
]

const work = page(
  'work',
  Page({
    title: 'Work',
    children: [
      Timeline({
        resource: 'phases',
        title: 'Where the time went',
        lane: 'project',
        bar: 'task_id',
        start: 'started_at',
        end: 'ended_at',
        color: 'phase',
        select: 'task',
        children: [ReferenceField({ source: 'task_id', reference: 'tasks' }), Field({ source: 'note' })],
      }),
    ],
  }),
)

const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString()

let id = 0
const phase = (project: string, task_id: number, kind: string, from: number, to: number | null, note: string | null = null) => ({ id: ++id, project, task_id, phase: kind, started_at: hoursAgo(from), ended_at: to === null ? null : hoursAgo(to), note })

const rows = () => ({
  tasks: [
    { id: 1, title: 'Sign-in with a code' },
    { id: 2, title: 'Export to CSV' },
    { id: 3, title: 'Rate limits' },
    { id: 4, title: 'Webhook retries' },
    { id: 5, title: 'Getting started guide' },
    { id: 6, title: 'API reference' },
  ],
  phases: [
    phase('web', 1, 'build', 30, 26, 'Split into two steps'),
    phase('web', 1, 'ci', 26, 25),
    phase('web', 1, 'land', 25, 24),
    phase('api', 3, 'build', 28, 20, 'Per token'),
    phase('api', 3, 'review', 20, 18),
    phase('docs', 5, 'build', 22, 16, 'With screenshots'),
    phase('docs', 5, 'ci', 16, 15),
    phase('web', 2, 'build', 14, 8, 'Streams the rows'),
    phase('web', 2, 'ci', 8, 6),
    phase('api', 4, 'build', 12, 4, 'Backs off'),
    phase('api', 4, 'ci', 4, null),
    phase('docs', 6, 'build', 6, null, 'Generated'),
  ],
})

const Work = () => {
  const [client] = useState(() => fakeApi({ resources: [tasks.toModel(), phases.toModel()], views: views.map((entry) => entry.toModel()), pages: [work.toModel()], rows: rows() }).client)
  return (
    <div className="min-h-screen">
      <App client={client} auth={session} initialUrl="/work" />
    </div>
  )
}

export const Desktop: StoryObj = { name: 'Projects, their tasks and a chosen task', globals: { viewport: { value: 'desktop1280' } }, render: () => <Work /> }

export const Phone: StoryObj = { ...Desktop, name: 'Projects, their tasks and a chosen task, on a phone', globals: { viewport: { value: 'phone390' } } }

// Each bar is a link that chooses its task; the chosen one shows its details and stands out, and the page never scrolls sideways
const play: StoryObj['play'] = async ({ canvasElement }) => {
  const canvas = within(canvasElement)
  const timeline = within(await canvas.findByRole('region', { name: 'Where the time went' }))
  expect(await timeline.findByText('Waiting for CI')).toBeVisible()
  const bars = await timeline.findAllByRole('link', { name: /Building/ })
  expect(bars).toHaveLength(6)
  const exportBar = bars.find((bar) => bar.getAttribute('href') === '/work?task=2')!
  expect(exportBar).toHaveAccessibleName(/^Export to CSV: .*; Building: .*; Waiting for CI: /)

  await userEvent.click(exportBar)
  await waitFor(() => expect(timeline.getByText('Streams the rows')).toBeVisible())
  expect(timeline.getAllByRole('link', { name: 'Export to CSV' }).length).toBeGreaterThan(0)
  expect(exportBar).toHaveAttribute('aria-current', 'true')
  expect(bars.find((bar) => bar.getAttribute('href') === '/work?task=1')).not.toHaveAttribute('aria-current')
  await waitFor(() => expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth))
}

// The chosen task is in the page's address, so opening it again shows it chosen
const reopened: StoryObj['play'] = async ({ canvasElement }) => {
  const timeline = within(await within(canvasElement).findByRole('region', { name: 'Where the time went' }))
  expect(await timeline.findByText('Backs off')).toBeVisible()
  expect((await timeline.findAllByRole('link', { name: /Building/ })).find((bar) => bar.getAttribute('href') === '/work?task=4')).toHaveAttribute('aria-current', 'true')
}

const ChosenWork = () => {
  const [client] = useState(() => fakeApi({ resources: [tasks.toModel(), phases.toModel()], views: views.map((entry) => entry.toModel()), pages: [work.toModel()], rows: rows() }).client)
  return (
    <div className="min-h-screen">
      <App client={client} auth={session} initialUrl="/work?task=4" />
    </div>
  )
}

export const Reopened: StoryObj = { ...Desktop, name: 'A task chosen in the address (checks)', tags: ['play', '!dev'], render: () => <ChosenWork />, play: reopened }

export const DesktopChecks: StoryObj = { ...Desktop, name: 'Projects, their tasks and a chosen task (checks)', tags: ['play', '!dev'], play }

export const PhoneChecks: StoryObj = { ...Phone, name: 'Projects, their tasks and a chosen task, on a phone (checks)', tags: ['play', '!dev', 'phone'], play }
