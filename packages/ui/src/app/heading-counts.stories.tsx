import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, within } from 'storybook/test'
import { createStaticSession } from '@protobase/client'
import type { LayoutItemModel, RelatedModel } from '@protobase/schema'
import { App } from './app'
import { fakeApi } from './testing/fake-api'
import { objectiveResources, objectiveRows, objectiveViews } from './testing/objectives-domain'

const viewports = { mobile360: { name: 'Mobile 360', styles: { width: '360px', height: '740px' }, type: 'mobile' } } as const

const meta = { title: 'Record page/Heading counts', parameters: { layout: 'fullscreen', viewport: { options: viewports } } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'story', email: 'story@example.test', name: 'Story User', role: 'manager' })

// An objective's open tasks by what they need, each table counting its tasks and the group adding them up
const tasks = (title: string, status: string): RelatedModel => ({
  kind: 'related',
  title,
  resource: 'tasks',
  field: 'id',
  through: { resource: 'objective_tasks', field: 'objective_id', key: 'task_id' },
  filter: `status = "${status}"`,
  columns: ['owner'],
  presentation: 'compact',
  count: true,
})

const group = 'Open tasks'
const layout: LayoutItemModel[] = [
  { kind: 'section', title: 'Objective', fields: ['title'] },
  { kind: 'group', title: group, help: 'What is left before the objective is met.', count: true, collapsed: true, items: [tasks('Blocked', 'blocked'), tasks('Doing', 'doing'), tasks('To do', 'todo')] },
]
const views = objectiveViews.map((view) => (view.resource === 'objectives' ? { ...view, layout } : view))

// On the browser's own history, which keeps the address the story starts at
const Objective = () => {
  const [api] = useState(() => {
    window.history.replaceState(null, '', '/objectives/1')
    return fakeApi({ resources: objectiveResources, views, rows: objectiveRows })
  })
  return (
    <div className="min-h-screen">
      <App client={api.client} auth={session} />
    </div>
  )
}

export const Counts: StoryObj = { name: 'A group and its related tables with counts', render: () => <Objective /> }

export const Phone: StoryObj = { ...Counts, name: 'A group and its related tables with counts, on a phone', globals: { viewport: { value: 'mobile360' } } }

/**
 * The closed group shows its help and how many open tasks it holds; opened, each table counts its own, an empty one 0,
 * and a screen reader hears each count with what it counts.
 */
export const Checks: StoryObj = {
  ...Counts,
  name: 'A group and its related tables with counts (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByRole('heading', { name: /^Open tasks \(3 tasks\)$/ })
    canvas.getByText('What is left before the objective is met.')
    expect(canvas.queryByRole('heading', { name: /^To do/ })).toBeNull()

    await userEvent.click(canvas.getByRole('link', { name: group }))
    await canvas.findByRole('heading', { name: /^Blocked \(0 tasks\)$/ })
    await canvas.findByRole('heading', { name: /^Doing \(1 task\)$/ })
    await canvas.findByRole('heading', { name: /^To do \(2 tasks\)$/ })
  },
}
