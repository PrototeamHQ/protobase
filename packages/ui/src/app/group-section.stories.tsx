import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { createStaticSession } from '@protobase/client'
import type { LayoutItemModel } from '@protobase/schema'
import { App } from './app'
import { fakeApi } from './testing/fake-api'
import { objectiveResources, objectiveRows, objectiveViews } from './testing/objectives-domain'

const meta = { title: 'Record page/Groups', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'story', email: 'story@example.test', name: 'Story User', role: 'manager' })

const title = 'Tasks & more, closed'
const layout: LayoutItemModel[] = [
  { kind: 'section', title: 'Objective', fields: ['title'] },
  {
    kind: 'group',
    title,
    collapsed: true,
    items: [
      { kind: 'section', title: 'Planning', fields: ['quarter'] },
      { kind: 'related', title: 'Tasks', resource: 'tasks', field: 'id', through: { resource: 'objective_tasks', field: 'objective_id', key: 'task_id' }, columns: ['title', 'status'], sort: 'position', limit: 3 },
    ],
  },
]
const views = objectiveViews.map((view) => (view.resource === 'objectives' ? { ...view, layout } : view))

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

const encoded = encodeURIComponent(title).replace(/%20/g, '+')

export const Collapsed: StoryObj = { name: 'A collapsed group', render: () => <Objective search="" /> }

/** A collapsed group shows only its heading, a link whose address opens it; clicking the heading opens it and clicking again closes it. */
export const Closed: StoryObj = {
  ...Collapsed,
  name: 'A collapsed group (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const heading = await canvas.findByRole('link', { name: title })
    expect(heading).toHaveAttribute('aria-expanded', 'false')
    expect(heading.getAttribute('href')).toMatch(new RegExp(`\\?open=${encoded}$`))
    expect(canvas.queryByRole('heading', { name: 'Planning' })).toBeNull()
    expect(canvas.queryByRole('heading', { name: 'Tasks' })).toBeNull()

    await userEvent.click(heading)
    await canvas.findByRole('heading', { name: 'Planning' })
    await canvas.findByRole('heading', { name: 'Tasks' })
    expect(heading).toHaveAttribute('aria-expanded', 'true')
    expect(new URLSearchParams(window.location.search).getAll('open')).toEqual([title])

    await userEvent.click(heading)
    await waitFor(() => expect(canvas.queryByRole('heading', { name: 'Planning' })).toBeNull())
    expect(window.location.search).toBe('')
  },
}

/** A link with the group named in the address opens the page with it already open. */
export const OpenFromAddress: StoryObj = {
  name: 'A group opened by the address (checks)',
  tags: ['play', '!dev'],
  render: () => <Objective search={`?open=${encoded}`} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByRole('heading', { name: 'Planning' })
    expect(await canvas.findByRole('link', { name: title })).toHaveAttribute('aria-expanded', 'true')
  },
}
