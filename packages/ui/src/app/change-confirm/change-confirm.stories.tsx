import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { createStaticSession } from '@protobase/client'
import { f, resource, view } from '@protobase/schema'
import { App } from '../app'
import { fakeApi } from '../testing/fake-api'

const meta = { title: 'Record/Confirming a change', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'story', email: 'story@example.test', name: 'Story User', role: 'admin' })

const tasks = resource('tasks')
  .table('tasks')
  .fields({
    id: f.integer().readOnly().filterable().sortable(),
    title: f.text(),
    estimate: f.integer().optional(),
    researched: f.boolean(),
  })
  .primaryKey((r) => r.id)

const tasksView = view<typeof tasks>('tasks')
  .title((r) => r.title)
  .names({ singular: 'Task', plural: 'Tasks' })
  .fields((r) => ({
    researched: r.researched.confirm('The research job sets this once it is done. Set it by hand only to skip the research.'),
    estimate: r.estimate.label('Estimate').confirm('The plan was made for this estimate.'),
  }))
  .list((r) => ({ columns: [r.title, r.estimate, r.researched], sort: [[r.id, 'asc']], editable: [r.title, r.estimate, r.researched] }))

/** The rows the fake server holds, so a play can check what a save stored. */
let stored: Record<string, Array<Record<string, unknown>>> = {}

const Tasks = ({ start }: { start: string }) => {
  const [client] = useState(() => {
    const api = fakeApi({ resources: [tasks.toModel()], views: [tasksView.toModel()], rows: { tasks: [{ id: 1, title: 'Field change confirm', estimate: 3, researched: false }] } })
    stored = api.rows
    return api.client
  })
  return (
    <div className="min-h-screen">
      <App client={client} auth={session} initialUrl={start} />
    </div>
  )
}

const task = () => stored.tasks![0]!
const body = (canvasElement: HTMLElement) => within(canvasElement.ownerDocument.body)

export const Editable: StoryObj = {
  render: () => <Tasks start="/tasks" />,
}

export const InTheList: StoryObj = {
  tags: ['play'],
  render: () => <Tasks start="/tasks" />,
  play: async ({ canvasElement }) => {
    const row = (await within(canvasElement).findByText('Field change confirm')).closest<HTMLElement>('[role=row]')!
    const cell = () => within(row).getAllByRole('gridcell')[2]!

    // Turning the switch asks first, and Cancel keeps the value
    await userEvent.dblClick(cell())
    await userEvent.click(within(cell()).getByRole('switch'))
    const dialog = await body(canvasElement).findByRole('dialog', { name: 'Change Researched?' })
    expect(dialog).toHaveTextContent('Set it by hand only to skip the research.')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(body(canvasElement).queryByRole('dialog')).toBeNull()
    expect(within(cell()).getByRole('switch')).toHaveAttribute('aria-checked', 'false')
    expect(task().researched).toBe(false)

    // Change saves it
    await userEvent.click(within(cell()).getByRole('switch'))
    await userEvent.click(within(await body(canvasElement).findByRole('dialog')).getByRole('button', { name: 'Change' }))
    await waitFor(() => expect(task().researched).toBe(true))
  },
}

export const OnTheForm: StoryObj = {
  tags: ['play'],
  render: () => <Tasks start="/tasks/1" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    // A number asks at its first key, Escape cancels it and the value stays
    const estimate = await canvas.findByRole('textbox', { name: 'Estimate' })
    await userEvent.type(estimate, '0')
    const dialog = await body(canvasElement).findByRole('dialog', { name: 'Change Estimate?' })
    expect(dialog).toHaveTextContent('The plan was made for this estimate.')
    await userEvent.keyboard('{Escape}')
    expect(body(canvasElement).queryByRole('dialog')).toBeNull()
    expect(estimate).toHaveValue('3')

    // Once changed, the keys after it do not ask again
    await userEvent.type(estimate, '0')
    await userEvent.click(within(await body(canvasElement).findByRole('dialog')).getByRole('button', { name: 'Change' }))
    await waitFor(() => expect(estimate).toHaveValue('30'))
    await userEvent.type(estimate, '5')
    expect(body(canvasElement).queryByRole('dialog')).toBeNull()
    expect(estimate).toHaveValue('305')

    // The switch asks too, and Save writes both
    await userEvent.click(canvas.getByRole('switch', { name: 'Researched' }))
    await userEvent.click(within(await body(canvasElement).findByRole('dialog')).getByRole('button', { name: 'Change' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(task()).toMatchObject({ estimate: 305, researched: true }))
  },
}
