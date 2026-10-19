import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, within } from 'storybook/test'
import { createStaticSession } from '@protobase/client'
import { f, l, resource, view } from '@protobase/schema'
import { App } from './app'
import { fakeApi } from './testing/fake-api'

const meta = { title: 'Record page/Sidebar ellipsis', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'story', email: 'story@example.test', name: 'Story User', role: 'admin' })

const tasks = resource('tasks')
  .table('tasks')
  .fields({ id: f.integer().readOnly().filterable().sortable(), title: f.text(), owner: f.text(), why: f.text(), notes: f.text() })
  .primaryKey((r) => r.id)

const tasksView = view<typeof tasks>('tasks')
  .title((r) => r.title)
  .names({ singular: 'Task', plural: 'Tasks' })
  .fields((r) => ({ why: r.why.multiline().label('Why'), notes: r.notes.markdown() }))
  .layout((r) => [l.section('Task', [r.title]), l.sidebar([r.owner, r.why, r.notes])])

const why = [
  'Long values in the sidebar used to wrap over several lines, which made the sidebar taller and shifted the whole page.',
  'A second paragraph explains it again, at length, so the value runs well past the width of the sidebar.',
].join('\n\n')
const notes = '## Plan\n\nCut **every** value to one line.'

const Tasks = () => {
  const [api] = useState(() => fakeApi({ resources: [tasks.toModel()], views: [tasksView.toModel()], rows: { tasks: [{ id: 1, title: 'Sidebar ellipsis', owner: 'Pip', why, notes }] } }))
  return (
    <div className="min-h-screen">
      <App client={api.client} auth={session} initialUrl="/tasks/1" />
    </div>
  )
}

export const LongValue: StoryObj = { name: 'A long, multi-line value', render: () => <Tasks /> }

export const LongValueChecks: StoryObj = {
  ...LongValue,
  name: 'A long, multi-line value (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const owner = (await canvas.findByText('Pip')).closest('dd')!
    const value = canvas.getByText(/^Long values in the sidebar/).closest('dd')!
    // The long value is cut to one line with an ellipsis, as tall as a short one, and shows whole on hover
    expect(getComputedStyle(value).textOverflow).toBe('ellipsis')
    expect(value.getBoundingClientRect().height).toBe(owner.getBoundingClientRect().height)
    expect(value.scrollWidth).toBeGreaterThan(value.clientWidth)
    expect(value).toHaveAttribute('title', why)
    // Markdown shows as its one-line excerpt, without its heading
    const excerpt = canvas.getByText('Plan Cut every value to one line.').closest('dd')!
    expect(excerpt.getBoundingClientRect().height).toBe(owner.getBoundingClientRect().height)
    expect(canvas.queryByRole('heading', { name: 'Plan' })).toBeNull()
  },
}
