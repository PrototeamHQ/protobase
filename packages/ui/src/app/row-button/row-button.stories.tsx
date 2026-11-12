import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, within } from 'storybook/test'
import { createStaticSession } from '@protobase/client'
import { Page, Table, page } from '@protobase/layout'
import { appPath, f, l, resource, view } from '@protobase/schema'
import { App } from '../app'
import { fakeApi } from '../testing/fake-api'

const meta = { title: 'Record page/Row buttons', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'story', email: 'story@example.test', name: 'Story User', role: 'admin' })

// A backlog whose tasks are held by other tasks: each hold says what the captain does next, on the task that holds it

const tasks = resource('tasks')
  .table('tasks')
  .fields({ id: f.integer().readOnly().filterable().sortable(), title: f.text() })
  .primaryKey((r) => r.id)

const holds = resource('holds')
  .table('holds')
  .fields({
    id: f.integer().readOnly().filterable().sortable(),
    task_id: f.relation('tasks').filterable(),
    reason: f.text(),
    verb: f.text().optional(),
    blocker_id: f.relation('tasks').optional(),
    tab: f.text().optional(),
    report_url: f.text().optional(),
  })
  .primaryKey((r) => r.id)

const next = { label: '{verb}', to: { kind: 'record' as const, resource: 'tasks', key: '{blocker_id}', tab: 'Review' } }

const tasksView = view<typeof tasks>('tasks')
  .title((r) => r.title)
  .names({ singular: 'Task', plural: 'Tasks' })
  .layout((r) => [
    l.related('Held by', { resource: 'holds', field: 'task_id', presentation: 'cards', columns: ['reason'], button: next }),
    l.related('Holds', { resource: 'holds', field: 'task_id', columns: ['reason'], button: next }),
    l.section('Task', [r.title]),
  ])

const holdsView = view<typeof holds>('holds')
  .title((r) => r.reason)
  .names({ singular: 'Hold', plural: 'Holds' })

const today = page('today', Page({ title: 'Today', children: Table({ title: 'Holds', resource: 'holds', columns: ['reason'], button: next }) }))

// Each hold settles somewhere else: its error report, the tab of the task it names, or the list of the task's holds
const lever = [
  { label: 'Error report', href: '{report_url}' },
  { label: '{verb}', to: { kind: 'record' as const, resource: 'tasks', key: '{blocker_id}', tab: '{tab}' } },
  { label: 'All its holds', to: { kind: 'list' as const, resource: 'holds', filter: 'task_id = {task_id}' } },
]

const attention = page('attention', Page({ title: 'Attention', children: Table({ title: 'Keep an eye on', resource: 'holds', columns: ['reason'], button: lever }) }))

const rows = () => ({
  tasks: [
    { id: 1, title: 'Ship the row buttons' },
    { id: 2, title: 'Settle the label' },
  ],
  holds: [
    { id: 1, task_id: 1, reason: 'Label wording', verb: 'Answer', blocker_id: 2 },
    { id: 2, task_id: 1, reason: 'Waiting on CI', verb: null, blocker_id: null },
    { id: 3, task_id: 2, reason: 'The build broke', verb: null, blocker_id: null, report_url: 'https://errors.example/e/42' },
    { id: 4, task_id: 2, reason: 'Read the run', verb: 'Read its chat', blocker_id: 1, tab: 'Chat' },
    { id: 5, task_id: 2, reason: 'Report at a plain address', verb: null, blocker_id: null, report_url: 'http://errors.example/e/43' },
  ],
})

const Backlog = ({ url }: { url: string }) => {
  const [api] = useState(() => fakeApi({ resources: [tasks.toModel(), holds.toModel()], views: [tasksView.toModel(), holdsView.toModel()], pages: [today.toModel(), attention.toModel()], rows: rows() }))
  return (
    <div className="min-h-screen">
      <App client={api.client} auth={session} initialUrl={url} />
    </div>
  )
}

const answer = appPath({ kind: 'record', resource: 'tasks', key: '2', tab: 'Review' })

export const OnRecordPage: StoryObj = { name: 'Holds on a task, as cards and as a table', render: () => <Backlog url="/tasks/1" /> }

/** Each card and row with a verb and a blocker has a button named by its verb that opens the blocker on its Review tab; the hold without them has none. */
export const OnRecordPageChecks: StoryObj = {
  ...OnRecordPage,
  name: 'Holds on a task, as cards and as a table (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    for (const title of ['Held by', 'Holds']) {
      const section = within((await canvas.findByRole('heading', { name: title })).closest('section')!)
      const button = await section.findByRole('link', { name: 'Answer' })
      expect(button.getAttribute('href')).toBe(answer)
      await section.findAllByText('Waiting on CI')
      expect(section.getAllByRole('link', { name: 'Answer' })).toHaveLength(1)
    }
  },
}

export const OnPage: StoryObj = { name: 'Holds in a Table on a page', render: () => <Backlog url="/today" /> }

/** A Table's rows carry the same button as their last column. */
export const OnPageChecks: StoryObj = {
  ...OnPage,
  name: 'Holds in a Table on a page (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const button = await canvas.findByRole('link', { name: 'Answer' })
    expect(button.getAttribute('href')).toBe(answer)
    await canvas.findAllByText('Waiting on CI')
    expect(canvas.getAllByRole('link', { name: 'Answer' })).toHaveLength(1)
  },
}

export const PerRow: StoryObj = { name: 'An attention list whose rows settle in different places', render: () => <Backlog url="/attention" /> }

/** Each row shows its first choice it has the fields for: an outside report, a task's tab, or a filtered list; a report at a non-https address shows none. */
export const PerRowChecks: StoryObj = {
  ...PerRow,
  name: 'An attention list whose rows settle in different places (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const report = await canvas.findByRole('link', { name: 'Error report (opens in a new tab)' })
    expect(report.getAttribute('href')).toBe('https://errors.example/e/42')
    expect(report.getAttribute('target')).toBe('_blank')
    expect(report.getAttribute('rel')).toBe('noreferrer')
    expect(canvas.getAllByRole('link', { name: /^Error report/ })).toHaveLength(1)
    expect(canvas.getByRole('link', { name: 'Read its chat' }).getAttribute('href')).toBe(appPath({ kind: 'record', resource: 'tasks', key: '1', tab: 'Chat' }))
    const holds = canvas.getAllByRole('link', { name: 'All its holds' })
    expect(holds.map((link) => link.getAttribute('href'))).toEqual([1, 1].map(() => appPath({ kind: 'list', resource: 'holds', filter: 'task_id = 1' })))
    await canvas.findAllByText('Report at a plain address')
    // Five rows, and the one whose report is not at an https address has no button
    expect(canvas.getAllByRole('link', { name: /^(Error report \(opens in a new tab\)|Read its chat|All its holds)$/ })).toHaveLength(4)
  },
}

