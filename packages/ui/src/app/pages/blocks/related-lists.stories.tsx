import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { createStaticSession, type Client } from '@protobase/client'
import { ArrayField, Card, Field, Page, RecordCard, RecordsIterator, ReferenceField, ReferenceManyField, Table, Text, page } from '@protobase/layout'
import { f, resource, view } from '@protobase/schema'
import { App } from '../../app'
import { fakeApi } from '../../testing/fake-api'

const meta = { title: 'Composed pages/Related lists', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'story', email: 'story@example.test', name: 'Story User', role: 'admin' })

// A task with its labels, its claims with who claimed them, and each claim with its steps: two levels of related records

const tasks = resource('tasks')
  .table('tasks')
  .fields({ id: f.integer().readOnly().filterable().sortable(), title: f.text(), labels: f.json() })
  .primaryKey((r) => r.id)
const workers = resource('workers')
  .table('workers')
  .fields({ id: f.integer().readOnly().filterable().sortable(), name: f.text() })
  .primaryKey((r) => r.id)
const claims = resource('task_claims')
  .table('task_claims')
  .fields({
    id: f.integer().readOnly().filterable().sortable(),
    task_id: f.relation('tasks').filterable(),
    worker_id: f.relation('workers').filterable(),
    claimed_at: f.timestamp().filterable().sortable(),
    status: f.text().filterable(),
  })
  .primaryKey((r) => r.id)
const steps = resource('claim_steps')
  .table('claim_steps')
  .fields({ id: f.integer().readOnly().filterable().sortable(), claim_id: f.relation('task_claims').filterable(), name: f.text() })
  .primaryKey((r) => r.id)

const views = [
  view<typeof tasks>('tasks').title((r) => r.title),
  view<typeof workers>('workers').title((r) => r.name),
  view<typeof claims>('task_claims').list((r) => ({ columns: [r.status, r.claimed_at] })),
  view<typeof steps>('claim_steps').title((r) => r.name),
]

const board = page(
  'board',
  Page({
    title: 'Board',
    children: RecordCard({
      resource: 'tasks',
      recordKey: '1',
      children: [
        ArrayField({ source: 'labels', children: RecordsIterator({ children: Field({ source: 'this', label: false }) }) }),
        ReferenceManyField({
          reference: 'task_claims',
          target: 'task_id',
          sort: { field: 'claimed_at', order: 'ASC' },
          children: RecordsIterator({
            children: Card({
              title: 'Claim {{@index}}',
              children: [
                ReferenceField({ source: 'worker_id', reference: 'workers' }),
                ReferenceManyField({ reference: 'claim_steps', target: 'claim_id', empty: 'No steps yet', children: RecordsIterator({ children: Field({ source: 'name', label: false }) }) }),
              ],
            }),
          }),
        }),
        Text({ as: 'h3', children: 'Claims by status' }),
        ReferenceManyField({ reference: 'task_claims', target: 'task_id', filter: "status = 'open'", perPage: 1, pagination: 'more', children: Table({ title: 'Open claims', columns: ['status', 'claimed_at'] }) }),
      ],
    }),
  }),
)

const rows = () => ({
  tasks: [{ id: 1, title: 'Ship the release', labels: ['urgent', 'small'] }],
  workers: [
    { id: 3, name: 'Ann' },
    { id: 4, name: 'Bo' },
  ],
  task_claims: [
    { id: 10, task_id: 1, worker_id: 3, claimed_at: '2026-11-01T09:00:00Z', status: 'open' },
    { id: 11, task_id: 1, worker_id: 4, claimed_at: '2026-11-02T09:00:00Z', status: 'open' },
  ],
  claim_steps: [
    { id: 1, claim_id: 10, name: 'Plan' },
    { id: 2, claim_id: 10, name: 'Build' },
  ],
})

/** The resources the page listed and searched, so a play can tell which block read what. */
let reads: string[] = []

const Board = () => {
  const [client] = useState(() => {
    reads = []
    const api = fakeApi({ resources: [tasks.toModel(), workers.toModel(), claims.toModel(), steps.toModel()], views: views.map((entry) => entry.toModel()), pages: [board.toModel()], rows: rows() })
    const list: Client['list'] = (name, params) => (reads.push(`list ${name}`), api.client.list(name, params))
    const search: Client['search'] = (name, params) => (reads.push(`search ${name}`), api.client.search(name, params))
    return { ...api.client, list, search } as Client
  })
  return (
    <div className="min-h-screen">
      <App client={client} auth={session} initialUrl="/board" />
    </div>
  )
}

export const Nested: StoryObj = { name: 'A task, its claims and their steps', render: () => <Board /> }

/**
 * Each claim draws once with its own steps, an empty one its empty text; the worker links to their record; text items
 * read as this; the table draws its list's records and reads nothing itself, and Load more adds the next page.
 */
export const Checks: StoryObj = {
  ...Nested,
  name: 'A task, its claims and their steps (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const first = within(await canvas.findByRole('region', { name: 'Claim 0' }))
    expect(await first.findByText('Plan')).toBeVisible()
    expect(first.getByText('Build')).toBeVisible()
    expect((await first.findByRole('link', { name: 'Ann' })).getAttribute('href')).toBe('/workers/3')
    const second = within(await canvas.findByRole('region', { name: 'Claim 1' }))
    expect(await second.findByText('No steps yet')).toBeVisible()
    expect(canvas.getByText('urgent')).toBeVisible()
    expect(canvas.getByText('small')).toBeVisible()

    // The header and one row per claim read so far
    const table = within(await canvas.findByRole('region', { name: 'Open claims' }))
    const rows = () => table.getAllByRole('row').filter((row) => !row.hasAttribute('aria-busy'))
    await waitFor(() => expect(rows()).toHaveLength(2))
    await userEvent.click(canvas.getByRole('button', { name: 'Load more' }))
    await waitFor(() => expect(rows()).toHaveLength(3))
    // A table of its own would search; this one only draws what its list read
    expect(reads).not.toContain('search task_claims')
    expect(reads).toContain('list task_claims')
  },
}
