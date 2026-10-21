import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { createStaticSession } from '@protobase/client'
import { Page, RecordCards, page } from '@protobase/layout'
import { f, resource, view } from '@protobase/schema'
import { App } from '../../app'
import { fakeApi } from '../../testing/fake-api'

const viewports = { mobile360: { name: 'Mobile 360', styles: { width: '360px', height: '740px' }, type: 'mobile' } } as const

const meta = { title: 'Composed pages/Record cards', parameters: { layout: 'fullscreen', viewport: { options: viewports } } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'story', email: 'story@example.test', name: 'Story User', role: 'admin' })

// A backlog's Today page: the preconditions and questions waiting on the captain, as the cards a task's page shows them

const tasks = resource('tasks')
  .table('tasks')
  .fields({ id: f.integer().readOnly().filterable().sortable(), title: f.text() })
  .primaryKey((r) => r.id)

const preconditions = resource('task_preconditions')
  .table('task_preconditions')
  .fields({
    id: f.integer().readOnly().filterable().sortable(),
    task_id: f.relation('tasks').filterable(),
    reason: f.text(),
    plan: f.text().optional(),
    state: f.enum(['waiting', 'approved']).filterable(),
  })
  .primaryKey((r) => r.id)

const questions = resource('task_questions')
  .table('task_questions')
  .fields({ id: f.integer().readOnly().filterable().sortable(), task_id: f.relation('tasks').filterable(), question: f.text(), answered: f.boolean().filterable() })
  .primaryKey((r) => r.id)

const tasksView = view<typeof tasks>('tasks')
  .title((r) => r.title)
  .names({ singular: 'Task', plural: 'Tasks' })

const preconditionsView = view<typeof preconditions>('task_preconditions')
  .title((r) => r.reason)
  .names({ singular: 'Precondition', plural: 'Preconditions' })
  .fields((r) => ({ plan: r.plan.markdown(), state: r.state.valueLabels({ waiting: 'Waiting', approved: 'Approved' }) }))
  .list((r) => ({ columns: [r.reason, r.state] }))
  .actions((a) => [a.update('approve', { label: 'Approve', confirm: 'The task goes on with this plan.', set: { state: 'approved' } })])

const questionsView = view<typeof questions>('task_questions')
  .title((r) => r.question)
  .names({ singular: 'Question', plural: 'Questions' })
  .list((r) => ({ columns: [r.question, r.answered] }))

const today = page(
  'today',
  Page({
    title: 'Today',
    children: [
      RecordCards({ title: 'Waiting on you', description: 'Plans to approve before their task goes on.', resource: 'task_preconditions', filter: "state = 'waiting'", fields: ['task_id', 'plan'], cardActions: ['approve'], limit: 2 }),
      RecordCards({ title: 'Questions for you', resource: 'task_questions', filter: 'answered = false', fields: ['task_id'], empty: 'No questions.' }),
    ],
  }),
)

const plan = ['## Plan', '', 'Show the records as **cards**, stacked.', '', ...Array.from({ length: 12 }, (_, index) => `- Step ${index + 1}: a line of the plan that takes room`)].join('\n')

const rows = () => ({
  tasks: [
    { id: 1, title: 'Today cards' },
    { id: 2, title: 'Rename the option' },
  ],
  task_preconditions: [
    { id: 1, task_id: 1, reason: 'Plan review', plan, state: 'waiting' },
    { id: 2, task_id: 2, reason: 'Short plan', plan: 'Rename the **option**.', state: 'waiting' },
    { id: 3, task_id: 2, reason: 'Landing', plan: null, state: 'waiting' },
    { id: 4, task_id: 1, reason: 'Done before', plan: 'Old plan', state: 'approved' },
  ],
  task_questions: [{ id: 1, task_id: 1, question: 'Which name?', answered: true }],
})

/** The rows the fake server holds, so a play can check what an action stored. */
let stored: Record<string, Array<Record<string, unknown>>> = {}

const Today = () => {
  const [api] = useState(() => {
    const created = fakeApi({
      resources: [tasks.toModel(), preconditions.toModel(), questions.toModel()],
      views: [tasksView.toModel(), preconditionsView.toModel(), questionsView.toModel()],
      pages: [today.toModel()],
      rows: rows(),
    })
    stored = created.rows
    return created
  })
  return (
    <div className="min-h-screen">
      <App client={api.client} auth={session} initialUrl="/today" />
    </div>
  )
}

export const Cards: StoryObj = { name: 'Waiting on the captain', render: () => <Today /> }

export const Phone: StoryObj = { ...Cards, name: 'Waiting on the captain, on a phone', globals: { viewport: { value: 'mobile360' } } }

/**
 * The cards stack under a heading that is no card, each linking to its record with a long plan cut short behind Show
 * more, the cut-off note and View all below them; Approve runs on its card's record, and an empty block says so.
 */
export const Checks: StoryObj = {
  ...Cards,
  name: 'Waiting on the captain (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const region = await canvas.findByRole('region', { name: 'Waiting on you' })
    const section = within(region)
    expect(region.className).not.toContain('border')
    const link = await section.findByRole('link', { name: 'Plan review' })
    expect(link.getAttribute('href')).toBe('/task_preconditions/1')
    expect(section.queryByRole('link', { name: 'Landing' })).toBeNull()
    expect(await section.findByText('The first 2 of 3.')).toBeVisible()
    expect(section.getByRole('link', { name: /View all/ }).getAttribute('href')).toContain('/task_preconditions')

    const more = await section.findByRole('button', { name: 'Show more' })
    await userEvent.click(more)
    expect(await section.findByRole('button', { name: 'Show less' })).toHaveAttribute('aria-expanded', 'true')

    await userEvent.click(within(link.closest('li')!).getByRole('button', { name: 'Approve' }))
    await userEvent.click(within(await within(document.body).findByRole('dialog', { name: 'Approve?' })).getByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(stored.task_preconditions!.find((row) => row.id === 1)?.state).toBe('approved'))
    await section.findByRole('link', { name: 'Landing' })

    expect(await within(await canvas.findByRole('region', { name: 'Questions for you' })).findByText('No questions.')).toBeVisible()
  },
}
