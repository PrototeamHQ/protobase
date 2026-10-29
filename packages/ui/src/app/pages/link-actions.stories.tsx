import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, within } from 'storybook/test'
import { createStaticSession, type ResourcePermissions } from '@protobase/client'
import { appPath, f, l, resource, view } from '@protobase/schema'
import { App } from '../app'
import { fakeApi } from '../testing/fake-api'

const meta = { title: 'Actions/Links', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'story', email: 'story@example.test', name: 'Story User', role: 'admin' })

const templates = resource('templates')
  .table('templates')
  .fields({ id: f.integer().readOnly().filterable().sortable(), name: f.text(), status: f.enum(['ready', 'draft']) })
  .primaryKey((r) => r.id)
const vms = resource('vms')
  .table('vms')
  .fields({ id: f.integer().readOnly().filterable().sortable(), name: f.text(), template_id: f.text() })
  .primaryKey((r) => r.id)

// A new VM from a ready template, disabled with why on a draft one, and the template's docs outside the app.
const templatesView = view<typeof templates>('templates')
  .title((r) => r.name)
  .recordMode('read')
  .layout((r) => [l.section('Template', [r.name, r.status])])
  .actions((a) => [
    a.link('new_vm', { label: 'New VM', icon: 'play', to: { kind: 'create', resource: 'vms', values: { template_id: '{id}' } }, when: "status = 'ready'", otherwise: 'disable', reason: 'The template is a draft' }),
    a.link('docs', { label: 'Docs', icon: 'file-text', href: 'https://docs.example/templates/{id}' }),
  ])

const rows = {
  templates: [
    { id: 1, name: 'debian', status: 'ready' },
    { id: 2, name: 'arch', status: 'draft' },
  ],
  vms: [],
}
const allowed = { read: true, create: true, update: true, delete: true, conditional: [] }
const permissions: Record<string, ResourcePermissions> = { templates: allowed, vms: allowed }

const Templates = ({ url }: { url: string }) => {
  const [api] = useState(() => fakeApi({ resources: [templates.toModel(), vms.toModel()], views: [templatesView.toModel()], rows: structuredClone(rows), permissions }))
  return (
    <div className="h-screen">
      <App client={api.client} auth={session} initialUrl={url} />
    </div>
  )
}

const newVm = appPath({ kind: 'create', resource: 'vms', values: { template_id: '1' } })

export const OnARecord: StoryObj = {
  tags: ['play'],
  render: () => <Templates url="/templates/1" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const link = await canvas.findByRole('link', { name: 'New VM' })
    expect(link).toHaveAttribute('href', newVm)
    expect(link).not.toHaveAttribute('target')
    const docs = canvas.getByRole('link', { name: 'Docs' })
    expect(docs).toHaveAttribute('href', 'https://docs.example/templates/1')
    expect(docs).toHaveAttribute('target', '_blank')
    expect(docs).toHaveAttribute('rel', 'noreferrer')
    // A page load would leave the story for a page Storybook does not have; routing in place opens the form in it
    await userEvent.click(link)
    expect(await canvas.findByDisplayValue('1')).toBeVisible()
    expect(canvasElement).toBeInTheDocument()
  },
}

export const DisabledOnARecord: StoryObj = {
  tags: ['play'],
  render: () => <Templates url="/templates/2" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const button = await canvas.findByRole('button', { name: 'New VM' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('title', 'The template is a draft')
    expect(button).not.toHaveAttribute('href')
    expect(canvas.queryByRole('link', { name: 'New VM' })).toBeNull()
  },
}

export const InARowMenu: StoryObj = {
  tags: ['play'],
  render: () => <Templates url="/templates" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const page = within(canvasElement.ownerDocument.body)
    await canvas.findByText('arch')
    const menus = canvas.getAllByRole('button', { name: 'Row actions' })
    await userEvent.click(menus[1]!)
    const disabled = await page.findByRole('menuitem', { name: 'New VM' })
    expect(disabled.tagName).toBe('BUTTON')
    expect(disabled).toBeDisabled()
    expect(disabled).toHaveAttribute('title', 'The template is a draft')
    await userEvent.keyboard('{Escape}')
    await userEvent.click(menus[0]!)
    const link = await page.findByRole('menuitem', { name: 'New VM' })
    expect(link.tagName).toBe('A')
    expect(link).toHaveAttribute('href', newVm)
    expect(page.getByRole('menuitem', { name: 'Docs' })).toHaveAttribute('target', '_blank')
    await userEvent.click(link)
    expect(await canvas.findByDisplayValue('1')).toBeVisible()
    expect(canvasElement).toBeInTheDocument()
  },
}
