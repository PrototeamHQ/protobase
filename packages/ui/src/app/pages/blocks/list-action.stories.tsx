import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { ApiError, createStaticSession, type ResourcePermissions } from '@protobase/client'
import { Action, Card, Page, RecordCard, RecordsIterator, ReferenceManyField, page } from '@protobase/layout'
import { f, resource, view } from '@protobase/schema'
import { App } from '../../app'
import { fakeApi } from '../../testing/fake-api'

const meta = { title: 'Composed pages/Action in a list', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'story', email: 'story@example.test', name: 'Story User', role: 'admin' })

// A release and the approvals it waits on, each with the details its approver confirms
const releases = resource('releases')
  .table('releases')
  .fields({ id: f.integer().readOnly().filterable().sortable(), title: f.text() })
  .primaryKey((r) => r.id)
const approvals = resource('approvals')
  .table('approvals')
  .fields({
    id: f.integer().readOnly().filterable().sortable(),
    release_id: f.relation('releases').filterable(),
    title: f.text(),
    checklist: f.json().optional(),
    checked: f.json().optional(),
    state: f.enum(['waiting', 'approved']).filterable(),
  })
  .primaryKey((r) => r.id)

const views = [
  view<typeof releases>('releases').title((r) => r.title),
  view<typeof approvals>('approvals')
    .title((r) => r.title)
    .actions((a) => [
      a.update('approve', {
        label: 'Approve',
        when: "state = 'waiting'",
        confirm: 'Tick each detail you confirm.',
        inputs: (i) => [i.checklist('checked', { label: 'What you checked', from: 'checklist' })],
        set: { checked: '{{checked}}', state: 'approved' },
      }),
    ]),
]

// The Action beside the RecordsIterator runs on every approval still waiting; the one inside it on its own record
const release = (key: string) =>
  RecordCard({
    resource: 'releases',
    recordKey: key,
    children: ReferenceManyField({
      reference: 'approvals',
      target: 'release_id',
      sort: { field: 'id', order: 'ASC' },
      children: [Action({ name: 'approve' }), RecordsIterator({ children: Card({ title: '{{title}}', children: Action({ name: 'approve' }) }) })],
    }),
  })

const pages = [page('release', Page({ title: 'Release', children: release('1') })), page('quiet', Page({ title: 'Quiet release', children: release('2') }))]

const rows = () => ({
  releases: [
    { id: 1, title: 'Billing' },
    { id: 2, title: 'Nothing waiting' },
  ],
  approvals: [
    { id: 1, release_id: 1, title: 'Release the billing page', checklist: ['The deploy is green', 'Prices match the plan'], checked: null, state: 'waiting' },
    { id: 2, release_id: 1, title: 'Turn on invoices', checklist: ['Prices match the plan', 'The tax rates are set'], checked: null, state: 'waiting' },
    { id: 3, release_id: 1, title: 'Rotate the signing key', checklist: ['The deploy is green'], checked: null, state: 'waiting' },
    { id: 4, release_id: 2, title: 'Publish the notes', checklist: [], checked: [], state: 'approved' },
  ],
})

const permissions: Record<string, ResourcePermissions> = {
  releases: { read: true, create: true, update: true, delete: true, conditional: [] },
  approvals: { read: true, create: true, update: true, delete: true, conditional: ['update'] },
}

// The server refuses the third approval, as an access rule on the record would.
const refuseKeyRotation = (name: string, row: Record<string, unknown>) => {
  if (name === 'approvals' && row.id === 3) throw new ApiError({ type: 'urn:protobase:problem:access-denied', title: 'Forbidden', status: 403, detail: 'You may not update this approvals record' })
}

const Release = ({ url }: { url: string }) => {
  const [api] = useState(() =>
    fakeApi({ resources: [releases.toModel(), approvals.toModel()], views: views.map((entry) => entry.toModel()), pages: pages.map((entry) => entry.toModel()), rows: rows(), permissions, beforeWrite: refuseKeyRotation }),
  )
  return (
    <div className="min-h-screen">
      <App client={api.client} auth={session} initialUrl={url} />
    </div>
  )
}

export const InAList: StoryObj = { name: 'An Action in a list', render: () => <Release url="/release" /> }

/** One dialog for all three approvals, the boxes they share shown once; the one the person may not change is refused and named. */
export const InAListChecks: StoryObj = {
  ...InAList,
  name: 'An Action in a list (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(canvasElement.ownerDocument.body)
    await canvas.findByText('Rotate the signing key')
    // One button per record inside the iterator, besides the one for the whole list
    expect(canvas.getAllByRole('button', { name: 'Approve' })).toHaveLength(3)
    await userEvent.click(canvas.getByRole('button', { name: 'Approve (3)' }))
    const dialog = within(await body.findByRole('dialog', { name: 'Approve (3)' }))
    expect(dialog.getByText('For “Release the billing page”, “Turn on invoices”, “Rotate the signing key”.')).toBeInTheDocument()
    expect(dialog.getAllByRole('checkbox').map((box) => box.closest('label')?.textContent)).toEqual(['The deploy is green', 'Prices match the plan', 'The tax rates are set'])
    for (const box of ['The deploy is green', 'Prices match the plan', 'The tax rates are set']) await userEvent.click(dialog.getByRole('checkbox', { name: box }))
    await userEvent.click(dialog.getByRole('button', { name: 'Approve (3)' }))
    expect(await body.findByText('Approve: done on 2, refused on 1')).toBeInTheDocument()
    expect(body.getByText('Not done on “Rotate the signing key”: you may not change it.')).toBeInTheDocument()
    // Only the refused approval still waits
    await waitFor(() => expect(canvas.getByRole('button', { name: 'Approve (1)' })).toBeInTheDocument())
    expect(canvas.getAllByRole('button', { name: 'Approve' })).toHaveLength(1)
  },
}

/** A list with no record the action applies to offers no button for it, as an empty one does not. */
export const EmptyListChecks: StoryObj = {
  name: 'An Action in an empty list (checks)',
  tags: ['play', '!dev'],
  render: () => <Release url="/quiet" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByText('Publish the notes')
    expect(canvas.queryByRole('button', { name: /Approve/ })).toBeNull()
  },
}
