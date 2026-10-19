import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { createStaticSession } from '@protobase/client'
import { f, l, resource, view } from '@protobase/schema'
import { App } from '../app'
import { fakeApi } from '../testing/fake-api'

const viewports = { mobile360: { name: 'Mobile 360', styles: { width: '360px', height: '740px' }, type: 'mobile' } } as const

const meta = { title: 'Record page/Related records as cards', parameters: { layout: 'fullscreen', viewport: { options: viewports } } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'story', email: 'story@example.test', name: 'Story User', role: 'admin' })

// A backlog whose tasks wait on the captain: preconditions to approve, with their plan in markdown, and questions to answer

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
    state: f.enum(['waiting', 'approved', 'changes_requested']).filterable(),
    changes: f.text().optional(),
  })
  .primaryKey((r) => r.id)

const questions = resource('task_questions')
  .table('task_questions')
  .fields({ id: f.integer().readOnly().filterable().sortable(), task_id: f.relation('tasks').filterable(), question: f.text(), answer: f.text().optional(), answered: f.boolean().filterable() })
  .primaryKey((r) => r.id)

const preconditionsView = view<typeof preconditions>('task_preconditions')
  .title((r) => r.reason)
  .names({ singular: 'Precondition', plural: 'Preconditions' })
  .fields((r) => ({ plan: r.plan.markdown(), state: r.state.valueLabels({ waiting: 'Waiting', approved: 'Approved', changes_requested: 'Changes requested' }) }))
  .list((r) => ({ columns: [r.reason, r.state] }))
  .actions((a) => [
    a.update('approve', { label: 'Approve', confirm: 'The task goes on with this plan.', set: { state: 'approved' } }),
    a.update('request_changes', { label: 'Request changes', inputs: (i) => [i.text('changes', { label: 'Changes', multiline: true })], set: { state: 'changes_requested', changes: '{changes}' } }),
  ])

const questionsView = view<typeof questions>('task_questions')
  .title((r) => r.question)
  .names({ singular: 'Question', plural: 'Questions' })
  .list((r) => ({ columns: [r.question, r.answered] }))

const tasksView = view<typeof tasks>('tasks')
  .title((r) => r.title)
  .names({ singular: 'Task', plural: 'Tasks' })
  .layout((r) => [
    l.related('Waiting on you', { resource: 'task_preconditions', field: 'task_id', filter: 'state = "waiting"', presentation: 'cards', columns: ['plan'], actions: ['approve', 'request_changes'], hideEmpty: true }),
    l.related('Questions for you', { resource: 'task_questions', field: 'task_id', filter: 'answered = false', presentation: 'cards', columns: ['question'], hideEmpty: true }),
    l.section('Task', [r.title]),
  ])

const plan = [
  '## Plan',
  '',
  'Show the related records as **cards**, each with its fields and its actions.',
  '',
  ...Array.from({ length: 12 }, (_, index) => `- Step ${index + 1}: a line of the plan that takes room`),
].join('\n')

const rows = () => ({
  tasks: [{ id: 1, title: 'Approve inline' }],
  task_preconditions: [
    { id: 1, task_id: 1, reason: 'Plan review', plan, state: 'waiting', changes: null },
    { id: 2, task_id: 1, reason: 'Short plan', plan: 'Rename the **option**.', state: 'waiting', changes: null },
    { id: 3, task_id: 1, reason: 'Done before', plan: 'Old plan', state: 'approved', changes: null },
    { id: 4, task_id: 1, reason: 'Landing', plan: null, state: 'waiting', changes: null },
  ],
  task_questions: [{ id: 1, task_id: 1, question: 'Which name?', answer: null, answered: true }],
})

/** The rows the fake server holds, so a play can check what an action stored. */
let stored: Record<string, Array<Record<string, unknown>>> = {}

const Task = () => {
  const [api] = useState(() => {
    const created = fakeApi({ resources: [tasks.toModel(), preconditions.toModel(), questions.toModel()], views: [tasksView.toModel(), preconditionsView.toModel(), questionsView.toModel()], rows: rows() })
    stored = created.rows
    return created
  })
  return (
    <div className="min-h-screen">
      <App client={api.client} auth={session} initialUrl="/tasks/1" />
    </div>
  )
}

export const Cards: StoryObj = { name: 'Preconditions waiting on the captain', render: () => <Task /> }

export const Phone: StoryObj = { ...Cards, name: 'Preconditions waiting on the captain, on a phone', globals: { viewport: { value: 'mobile360' } } }

/**
 * Each card links to its record and shows its plan as markdown, a long one cut short with Show more, and one without a
 * plan leaves the field off; Approve asks its
 * confirmation first, Request changes its inputs, and a section with no records is left off.
 */
export const Checks: StoryObj = {
  ...Cards,
  name: 'Preconditions waiting on the captain (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const section = within((await canvas.findByRole('heading', { name: 'Waiting on you' })).closest('section')!)
    const link = await section.findByRole('link', { name: 'Plan review' })
    expect(link.getAttribute('href')).toBe('/task_preconditions/1')
    expect(section.queryByRole('link', { name: 'Done before' })).toBeNull()
    await section.findByRole('heading', { name: 'Plan' })
    expect(canvas.queryByRole('heading', { name: 'Questions for you' })).toBeNull()

    const more = await section.findByRole('button', { name: 'Show more' })
    expect(section.getAllByRole('button', { name: 'Show more' })).toHaveLength(1)
    await userEvent.click(more)
    expect(await section.findByRole('button', { name: 'Show less' })).toHaveAttribute('aria-expanded', 'true')

    const landing = within((await section.findByRole('link', { name: 'Landing' })).closest('li')!)
    expect(landing.queryByText('Plan')).toBeNull()
    expect(landing.queryByText('—')).toBeNull()
    await userEvent.click(landing.getByRole('button', { name: 'Approve' }))
    await userEvent.click(within(await within(document.body).findByRole('dialog', { name: 'Approve?' })).getByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(stored.task_preconditions!.find((row) => row.id === 4)?.state).toBe('approved'))

    const card = within(link.closest('li')!)
    await userEvent.click(card.getByRole('button', { name: 'Approve' }))
    const confirm = await within(document.body).findByRole('dialog', { name: 'Approve?' })
    await userEvent.click(within(confirm).getByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(stored.task_preconditions!.find((row) => row.id === 1)?.state).toBe('approved'))
    await waitFor(() => expect(section.queryByRole('link', { name: 'Plan review' })).toBeNull())

    const short = within((await section.findByRole('link', { name: 'Short plan' })).closest('li')!)
    await userEvent.click(short.getByRole('button', { name: 'Request changes' }))
    const dialog = await within(document.body).findByRole('dialog', { name: /Request changes/ })
    await userEvent.type(within(dialog).getByRole('textbox'), 'Name it presentation')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Request changes' }))
    await waitFor(() => expect(stored.task_preconditions!.find((row) => row.id === 2)).toMatchObject({ state: 'changes_requested', changes: 'Name it presentation' }))
    await waitFor(() => expect(canvas.queryByRole('heading', { name: 'Waiting on you' })).toBeNull())
  },
}
