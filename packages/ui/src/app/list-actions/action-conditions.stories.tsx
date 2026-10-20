import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { createStaticSession, type ResourcePermissions } from '@protobase/client'
import { f, l, resource, view } from '@protobase/schema'
import { App } from '../app'
import { fakeApi } from '../testing/fake-api'

const meta = { title: 'Actions/Conditions', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'story', email: 'story@example.test', name: 'Story User', role: 'admin' })

const vms = resource('vms')
  .table('vms')
  .fields({ id: f.integer().readOnly().filterable().sortable(), name: f.text(), status: f.enum(['running', 'rebooting', 'stopped']) })
  .primaryKey((r) => r.id)

// Start only on a stopped VM, Reboot only on a running one, and Force off on a running one, disabled with why otherwise.
const vmsView = view<typeof vms>('vms')
  .title((r) => r.name)
  .names({ singular: 'VM', plural: 'VMs' })
  .recordMode('read')
  .fields((r) => ({ status: r.status.valueLabels({ running: 'Running', rebooting: 'Rebooting', stopped: 'Stopped' }) }))
  .layout((r) => [l.section('VM', [r.name, r.status])])
  .actions((a) => [
    a.update('start', { label: 'Start', icon: 'play', when: "status = 'stopped'", set: { status: 'running' }, bulk: true }),
    a.update('reboot', { label: 'Reboot', icon: 'restart', when: "status = 'running'", set: { status: 'rebooting' }, bulk: true }),
    a.update('force_off', { label: 'Force off', icon: 'power', when: "status = 'running'", otherwise: 'disable', reason: 'The VM is not running', variant: 'danger', confirm: 'The VM loses what it has not saved.', set: { status: 'stopped' } }),
  ])

const rows = {
  vms: [
    { id: 1, name: 'web-1', status: 'running' },
    { id: 2, name: 'db-1', status: 'stopped' },
  ],
}
const permissions: Record<string, ResourcePermissions> = { vms: { read: true, create: true, update: true, delete: true, conditional: [] } }

const Vms = ({ url }: { url: string }) => {
  const [api] = useState(() => fakeApi({ resources: [vms.toModel()], views: [vmsView.toModel()], rows: structuredClone(rows), permissions }))
  return (
    <div className="h-screen">
      <App client={api.client} auth={session} initialUrl={url} />
    </div>
  )
}

export const RunningVm: StoryObj = {
  tags: ['play'],
  render: () => <Vms url="/vms/1" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(await canvas.findByRole('button', { name: 'Reboot' })).toBeEnabled()
    expect(canvas.queryByRole('button', { name: 'Start' })).toBeNull()
    const forceOff = canvas.getByRole('button', { name: 'Force off' })
    expect(within(forceOff).getByText('Force off')).toHaveClass('text-danger-text')
    await userEvent.click(forceOff)
    const confirm = await canvas.findByRole('dialog', { name: 'Force off?' })
    await userEvent.click(within(confirm).getByRole('button', { name: 'Force off' }))
    expect(await canvas.findByText('Force off: done')).toBeInTheDocument()
    expect(await canvas.findByRole('button', { name: 'Start' })).toBeEnabled()
  },
}

export const StoppedVm: StoryObj = {
  tags: ['play'],
  render: () => <Vms url="/vms/2" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(await canvas.findByRole('button', { name: 'Start' })).toBeEnabled()
    expect(canvas.queryByRole('button', { name: 'Reboot' })).toBeNull()
    const forceOff = canvas.getByRole('button', { name: 'Force off' })
    expect(forceOff).toBeDisabled()
    expect(forceOff).toHaveAttribute('title', 'The VM is not running')
  },
}

export const RowMenus: StoryObj = {
  tags: ['play'],
  render: () => <Vms url="/vms" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const page = within(canvasElement.ownerDocument.body)
    await canvas.findByText('db-1')
    const menus = canvas.getAllByRole('button', { name: 'Row actions' })
    await userEvent.click(menus[1]!)
    expect(await page.findByRole('menuitem', { name: 'Start' })).toBeEnabled()
    expect(page.queryByRole('menuitem', { name: 'Reboot' })).toBeNull()
    expect(page.getByRole('menuitem', { name: 'Force off' })).toBeDisabled()
    expect(page.getByRole('menuitem', { name: 'Force off' })).toHaveAttribute('title', 'The VM is not running')
    await userEvent.keyboard('{Escape}')
    await userEvent.click(menus[0]!)
    expect(await page.findByRole('menuitem', { name: 'Reboot' })).toBeEnabled()
    expect(page.getByRole('menuitem', { name: 'Force off' })).toHaveClass('text-danger-text')
  },
}

export const BulkSkipsWhereItDoesNotApply: StoryObj = {
  tags: ['play'],
  render: () => <Vms url="/vms" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByText('db-1')
    for (const box of canvas.getAllByRole('checkbox', { name: /Select row/ })) await userEvent.click(box)
    expect(canvas.queryByRole('button', { name: /Force off/ })).toBeNull()
    await userEvent.click(await canvas.findByRole('button', { name: 'Start (1)' }))
    expect(await canvas.findByText('Start: done on 1, skipped 1 it does not apply to')).toBeInTheDocument()
    await waitFor(() => expect(canvas.queryByText('Stopped')).toBeNull())
  },
}
