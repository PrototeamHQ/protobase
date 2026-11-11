import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { createStaticSession, type LiveHandlers } from '@protobase/client'
import { f, l, resource, view } from '@protobase/schema'
import { App } from '../app'
import { fakeApi } from '../testing/fake-api'

const viewports = { mobile360: { name: 'Mobile 360', styles: { width: '360px', height: '740px' }, type: 'mobile' } } as const

const meta = { title: 'Record page/A related record in full', parameters: { layout: 'fullscreen', viewport: { options: viewports } } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'story', email: 'story@example.test', name: 'Story User', role: 'admin' })

// An objective with the coordinator's notes on it, one record per objective, read on its own tab, and the latest review

const objectives = resource('objectives')
  .table('objectives')
  .fields({ id: f.integer().readOnly().filterable().sortable(), title: f.text() })
  .primaryKey((r) => r.id)

const notes = resource('objective_notes')
  .table('objective_notes')
  .fields({ id: f.integer().readOnly().filterable().sortable(), objective_id: f.relation('objectives').filterable(), notes: f.text().optional() })
  .primaryKey((r) => r.id)
  .live()

const reviews = resource('objective_reviews')
  .table('objective_reviews')
  .fields({ id: f.integer().readOnly().filterable().sortable(), objective_id: f.relation('objectives').filterable(), reviewer: f.text(), verdict: f.text() })
  .primaryKey((r) => r.id)

const objectivesView = view<typeof objectives>('objectives')
  .title((r) => r.title)
  .names({ singular: 'Objective', plural: 'Objectives' })
  .layout((r) => [
    l.tab('Overview', [
      l.section('Objective', [r.title]),
      l.related('Latest review', { resource: 'objective_reviews', field: 'objective_id', sort: 'id desc', presentation: 'record', columns: ['reviewer', 'verdict'] }),
    ]),
    l.tab('Notes', [l.related('Coordinator notes', { resource: 'objective_notes', field: 'objective_id', presentation: 'record', columns: ['notes'], empty: 'No notes yet.' })]),
  ])

const notesView = view<typeof notes>('objective_notes')
  .names({ singular: 'Note', plural: 'Notes' })
  .fields((r) => ({ notes: r.notes.markdown() }))

const reviewsView = view<typeof reviews>('objective_reviews').names({ singular: 'Review', plural: 'Reviews' })

const text = [
  '## Where it stands',
  '',
  'The coordinator keeps **one page of notes** per objective, read in full.',
  '',
  ...Array.from({ length: 16 }, (_, index) => `- Point ${index + 1}: a line of the notes that takes room on the page`),
  '',
  'The last line of the notes.',
].join('\n')

const rows = () => ({
  objectives: [{ id: 1, title: 'Fantastic default UX' }, { id: 2, title: 'Faster lists' }],
  objective_notes: [{ id: 1, objective_id: 1, notes: text }],
  objective_reviews: [
    { id: 1, objective_id: 1, reviewer: 'Ada', verdict: 'Too early to say' },
    { id: 2, objective_id: 1, reviewer: 'Bram', verdict: 'On track' },
  ],
})

/** The rows the fake server holds and the page's live stream, so a play can change a record as another user does. */
let stored: Record<string, Array<Record<string, unknown>>> = {}
const listeners = new Set<LiveHandlers>()

const Objective = ({ path }: { path: string }) => {
  const [client] = useState(() => {
    const created = fakeApi({ resources: [objectives.toModel(), notes.toModel(), reviews.toModel()], views: [objectivesView.toModel(), notesView.toModel(), reviewsView.toModel()], rows: rows() })
    stored = created.rows
    return {
      ...created.client,
      live: (handlers: LiveHandlers) => {
        listeners.add(handlers)
        return () => void listeners.delete(handlers)
      },
    }
  })
  return (
    <div className="min-h-screen">
      <App client={client} auth={session} initialUrl={path} />
    </div>
  )
}

export const Notes: StoryObj = { name: 'Coordinator notes on a tab', render: () => <Objective path="/objectives/1" /> }

export const Phone: StoryObj = { ...Notes, name: 'Coordinator notes on a tab, on a phone', globals: { viewport: { value: 'mobile360' } } }

/**
 * The review shows its fields under their labels and the notes their one field in full, without a label, card title,
 * Show more or View all, each with a link to its record; a change to the notes shows as soon as it is heard, and an
 * objective without notes says so.
 */
export const Checks: StoryObj = {
  ...Notes,
  name: 'Coordinator notes on a tab (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const review = within((await canvas.findByRole('heading', { name: 'Latest review' })).closest('section')!)
    expect(await review.findByText('On track')).toBeVisible()
    expect(review.getByText('Verdict')).toBeVisible()
    expect(review.queryByText('Too early to say')).toBeNull()
    expect(review.getByRole('link', { name: 'Open review' }).getAttribute('href')).toBe('/objective_reviews/2')

    await userEvent.click(within(canvas.getByRole('navigation', { name: 'Tabs' })).getByRole('link', { name: 'Notes' }))
    const section = within((await canvas.findByRole('heading', { name: 'Coordinator notes' })).closest('section')!)
    expect(await section.findByText('The last line of the notes.')).toBeVisible()
    await section.findByRole('heading', { name: 'Where it stands' })
    expect(section.queryByText('Notes')).toBeNull()
    expect(section.queryByRole('button', { name: 'Show more' })).toBeNull()
    expect(section.queryByRole('link', { name: /View all/ })).toBeNull()
    expect(section.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual(['/objective_notes/1'])
    expect(section.getByRole('link', { name: 'Open note' })).toBeVisible()

    stored.objective_notes![0]!.notes = 'Rewritten by the coordinator.'
    for (const listener of listeners) listener.onChanges([{ resource: 'objective_notes', key: '1', operation: 'update' }])
    await waitFor(() => expect(section.getByText('Rewritten by the coordinator.')).toBeVisible())
  },
}

export const NoNotes: StoryObj = {
  name: 'An objective without notes (checks)',
  tags: ['play', '!dev'],
  render: () => <Objective path="/objectives/2" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(within(await canvas.findByRole('navigation', { name: 'Tabs' })).getByRole('link', { name: 'Notes' }))
    const section = within((await canvas.findByRole('heading', { name: 'Coordinator notes' })).closest('section')!)
    expect(await section.findByText('No notes yet.')).toBeVisible()
    expect(section.queryByRole('link')).toBeNull()
  },
}
