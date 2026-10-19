import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { createStaticSession } from '@protobase/client'
import type { LayoutItemModel } from '@protobase/schema'
import { App } from './app'
import { fakeApi } from './testing/fake-api'
import { objectiveResources, objectiveRows, objectiveViews } from './testing/objectives-domain'

const meta = { title: 'Record page/Tabs', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'story', email: 'story@example.test', name: 'Story User', role: 'manager' })

const layout: LayoutItemModel[] = [
  { kind: 'tab', title: 'Objective', items: [{ kind: 'section', title: 'Objective', fields: ['title'] }] },
  {
    kind: 'tab',
    title: 'Plan',
    items: [
      { kind: 'section', title: 'Planning', fields: ['quarter'] },
      { kind: 'related', title: 'Tasks', resource: 'tasks', field: 'id', through: { resource: 'objective_tasks', field: 'objective_id', key: 'task_id' }, columns: ['title', 'status'], sort: 'position', limit: 3 },
    ],
  },
]
const views = objectiveViews.map((view) => (view.resource === 'objectives' ? { ...view, layout, recordMode: 'read' as const } : view))

// On the browser's own history, which keeps the address the story starts at
const Objective = ({ search }: { search: string }) => {
  const [api] = useState(() => {
    window.history.replaceState(null, '', `/objectives/1${search}`)
    return fakeApi({ resources: objectiveResources, views, rows: objectiveRows })
  })
  return (
    <div className="h-screen">
      <App client={api.client} auth={session} />
    </div>
  )
}

export const Reading: StoryObj = { name: 'A record with tabs', render: () => <Objective search="" /> }

/** The first tab is open without a `tab` in the address; clicking another tab shows its items and puts its title in the address, which Edit keeps. */
export const ReadingChecks: StoryObj = {
  ...Reading,
  name: 'A record with tabs (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const first = await canvas.findByRole('link', { name: 'Objective' })
    expect(first).toHaveAttribute('aria-current', 'page')
    expect(first.getAttribute('href')).not.toContain('tab=')
    await canvas.findByRole('heading', { name: 'Objective' })
    expect(canvas.queryByRole('heading', { name: 'Planning' })).toBeNull()

    await userEvent.click(canvas.getByRole('link', { name: 'Plan' }))
    await canvas.findByRole('heading', { name: 'Planning' })
    await canvas.findByRole('heading', { name: 'Tasks' })
    expect(new URLSearchParams(window.location.search).get('tab')).toBe('Plan')
    const edit = await canvas.findByRole('link', { name: 'Edit' })
    expect(edit.getAttribute('href')).toContain('edit=true')
    expect(edit.getAttribute('href')).toContain('tab=Plan')
  },
}

export const Editing: StoryObj = { name: 'A record with tabs, editing', render: () => <Objective search="?edit=true&tab=Plan" /> }

/** The form shows the same tabs; its fields on another tab keep their place, and the address keeps the form. */
export const EditingChecks: StoryObj = {
  ...Editing,
  name: 'A record with tabs, editing (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByRole('textbox', { name: 'Quarter' })
    expect(canvas.queryByRole('textbox', { name: 'Title' })).toBeNull()

    await userEvent.click(canvas.getByRole('link', { name: 'Objective' }))
    await canvas.findByRole('textbox', { name: 'Title' })
    await waitFor(() => expect(new URLSearchParams(window.location.search).get('edit')).toBe('true'))
    expect(new URLSearchParams(window.location.search).has('tab')).toBe(false)
  },
}
