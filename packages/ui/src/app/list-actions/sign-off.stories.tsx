import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { ApiError, createStaticSession, type ResourcePermissions } from '@protobase/client'
import { Page, Table, page } from '@protobase/layout'
import { f, l, resource, view } from '@protobase/schema'
import { App } from '../app'
import { fakeApi } from '../testing/fake-api'

const meta = { title: 'Actions/Sign off several', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'story', email: 'story@example.test', name: 'Story User', role: 'admin' })

// Steps waiting on one person, each with the details they confirm before approving it; one step unlocks several.
const approvals = resource('approvals')
  .table('approvals')
  .fields({
    id: f.integer().readOnly().filterable().sortable(),
    title: f.text(),
    checklist: f.json().optional(),
    checked: f.json().optional(),
    state: f.enum(['waiting', 'approved']).filterable(),
  })
  .primaryKey((r) => r.id)

const approvalsView = view<typeof approvals>('approvals')
  .title((r) => r.title)
  .names({ singular: 'Approval', plural: 'Approvals' })
  .recordMode('read')
  .list((r) => ({ columns: [r.title, r.state] }))
  .fields((r) => ({ state: r.state.valueLabels({ waiting: 'Waiting', approved: 'Approved' }) }))
  .layout((r) => [l.section('Approval', [r.title, r.state])])
  .actions((a) => [
    a.update('approve', {
      label: 'Approve',
      icon: 'check',
      bulk: true,
      when: "state = 'waiting'",
      confirm: 'Tick each detail you confirm.',
      inputs: (i) => [i.checklist('checked', { label: 'What you checked', from: 'checklist' })],
      set: { checked: '{checked}', state: 'approved' },
    }),
  ])

const today = page('today', Page({ title: 'Today', children: Table({ title: 'Waiting on you', resource: 'approvals', filter: "state = 'waiting'", bulk: true }) }))

const rows = () => ({
  approvals: [
    { id: 1, title: 'Release the billing page', checklist: ['The deploy is green', 'Prices match the plan'], checked: null, state: 'waiting' },
    { id: 2, title: 'Turn on invoices', checklist: ['Prices match the plan', 'The tax rates are set'], checked: null, state: 'waiting' },
    { id: 3, title: 'Rotate the signing key', checklist: ['The deploy is green'], checked: null, state: 'waiting' },
  ],
})

const permissions: Record<string, ResourcePermissions> = { approvals: { read: true, create: true, update: true, delete: true, conditional: ['update'] } }

// The server refuses the third step, as an access rule on the record would.
const refuseKeyRotation = (name: string, row: Record<string, unknown>) => {
  if (name === 'approvals' && row.id === 3) throw new ApiError({ type: 'urn:protobase:problem:access-denied', title: 'Forbidden', status: 403, detail: 'You may not update this approvals record' })
}

const Approvals = ({ url }: { url: string }) => {
  const [api] = useState(() => fakeApi({ resources: [approvals.toModel()], views: [approvalsView.toModel()], pages: [today.toModel()], rows: rows(), permissions, beforeWrite: refuseKeyRotation }))
  return (
    <div className="min-h-screen">
      <App client={api.client} auth={session} initialUrl={url} />
    </div>
  )
}

// Selects every row, opens Approve for them, is refused until each box is ticked, then approves those it may.
const signOffAll = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement)
  const body = within(canvasElement.ownerDocument.body)
  await canvas.findByText('Rotate the signing key')
  for (const row of [1, 2, 3]) await userEvent.click(await canvas.findByRole('checkbox', { name: `Select row ${row}` }))
  await userEvent.click(await canvas.findByRole('button', { name: 'Approve (3)' }))
  const dialog = within(await body.findByRole('dialog', { name: 'Approve (3)' }))
  expect(dialog.getByText('For “Release the billing page”, “Turn on invoices”, “Rotate the signing key”.')).toBeInTheDocument()
  // Each box once, though two steps share it
  expect(dialog.getAllByRole('checkbox').map((box) => box.closest('label')?.textContent)).toEqual(['The deploy is green', 'Prices match the plan', 'The tax rates are set'])
  await userEvent.click(dialog.getByRole('checkbox', { name: 'The deploy is green' }))
  await userEvent.click(dialog.getByRole('button', { name: 'Approve (3)' }))
  expect(await dialog.findByText('Tick the 2 remaining boxes')).toBeInTheDocument()
  await userEvent.click(dialog.getByRole('checkbox', { name: 'Prices match the plan' }))
  await userEvent.click(dialog.getByRole('checkbox', { name: 'The tax rates are set' }))
  await userEvent.click(dialog.getByRole('button', { name: 'Approve (3)' }))
  expect(await body.findByText('Approve: done on 2, refused on 1')).toBeInTheDocument()
  expect(body.getByText('Not done on “Rotate the signing key”: you may not change it.')).toBeInTheDocument()
}

export const InTheList: StoryObj = { name: 'Approving several from the list', render: () => <Approvals url="/approvals" /> }

/** One checklist for three steps, the boxes they share shown once; the step the person may not change is refused and named. */
export const InTheListChecks: StoryObj = {
  ...InTheList,
  name: 'Approving several from the list (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    await signOffAll(canvasElement)
    const canvas = within(canvasElement)
    await waitFor(() => expect(canvas.getAllByText('Approved')).toHaveLength(2))
  },
}

export const OnAPage: StoryObj = { name: 'Approving several from a Table on a page', render: () => <Approvals url="/today" /> }

/** A Table with `bulk` offers the same, and drops the approved steps from its filter. */
export const OnAPageChecks: StoryObj = {
  ...OnAPage,
  name: 'Approving several from a Table on a page (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    await signOffAll(canvasElement)
    const canvas = within(canvasElement)
    await waitFor(() => expect(canvas.queryByText('Turn on invoices')).toBeNull())
    expect(canvas.getByText('Rotate the signing key')).toBeInTheDocument()
  },
}
