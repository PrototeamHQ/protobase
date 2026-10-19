import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { ApiError, createStaticSession } from '@protobase/client'
import { tasks, tasksView } from '../../../../../docs-examples/reference/ranked-board'
import { App } from '../app'
import { fakeApi } from '../testing/fake-api'

const meta = { title: 'List page/Ranked board', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'pip', email: 'pip@bikeshop.example', name: 'Pip', role: 'admin' })

const rows = () => ({
  tasks: [
    { id: 1, title: 'Order brake pads', status: 'todo', rank: 2 },
    { id: 2, title: 'Call Emma back', status: 'todo', rank: 1 },
    { id: 3, title: 'Price the winter service', status: 'todo', rank: 3 },
    { id: 4, title: 'Fix the stand clamp', status: 'doing', rank: 1 },
    { id: 5, title: 'Restock inner tubes', status: 'doing', rank: 2 },
    { id: 6, title: 'Clean the workshop', status: 'done', rank: 1 },
    { id: 7, title: 'Send October invoices', status: 'done', rank: 2 },
  ],
})

// With `refuse`, the server refuses every drop, as it does when someone else changed a task since it loaded.
const Team = ({ refuse, start = '/tasks' }: { refuse?: boolean; start?: string }) => {
  const [api] = useState(() => fakeApi({ resources: [tasks.toModel()], views: [tasksView.toModel()], rows: rows() }))
  const client = refuse
    ? {
        ...api.client,
        batchWrite: async () => {
          throw new ApiError({ type: 'urn:protobase:problem:precondition-failed', title: 'Precondition Failed', status: 412, detail: 'The record changed since it was read; fetch it again' })
        },
      }
    : api.client
  return (
    <div className="h-screen">
      <App client={client} auth={session} initialUrl={start} workspace="Pip's bike shop" />
    </div>
  )
}

export const Tasks: StoryObj = { name: 'A board in rank order', render: () => <Team /> }

const column = (canvas: ReturnType<typeof within>, name: string) => canvas.findByRole('region', { name: new RegExp(`^${name}, \\d+$`) })
const titles = (region: HTMLElement) => within(region).queryAllByRole('link').map((link) => link.firstElementChild?.firstElementChild?.textContent)

// Space picks the focused card up, each arrow key moves it to the place it names, and Space drops it; each key waits
// for what the board tells a screen reader, so the next one lands once the board listens for it.
const moveByKeyboard = async (card: HTMLElement, steps: Array<[key: string, place: string]>) => {
  const announced = (text: string) => waitFor(() => expect(within(document.body).getByText(text, { exact: false, ignore: 'a, a *' })).toBeInTheDocument())
  card.focus()
  await userEvent.keyboard(' ')
  await announced('is over ')
  for (const [key, place] of steps) {
    await userEvent.keyboard(key)
    await announced(`is over ${place}.`)
  }
  await userEvent.keyboard(' ')
}

export const TasksPlaceChecks: StoryObj = {
  ...Tasks,
  name: 'A board in rank order, cards moved with the keyboard (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const todo = await column(canvas, 'todo')
    await waitFor(() => expect(titles(todo)).toEqual(['Call Emma back', 'Order brake pads', 'Price the winter service']))
    // Its order is the rank's, so it has no sort
    expect(canvas.queryByRole('combobox', { name: 'Sort' })).toBeNull()
    // Up within its column
    await moveByKeyboard(within(todo).getAllByRole('link')[2]!, [['{ArrowUp}', 'todo, place 2 of 3']])
    await waitFor(() => expect(titles(todo)).toEqual(['Call Emma back', 'Price the winter service', 'Order brake pads']))
    // To the second place of another column
    await moveByKeyboard(within(todo).getAllByRole('link')[0]!, [
      ['{ArrowRight}', 'doing, place 1 of 3'],
      ['{ArrowDown}', 'doing, place 2 of 3'],
    ])
    const doing = await column(canvas, 'doing')
    await waitFor(() => expect(titles(doing)).toEqual(['Fix the stand clamp', 'Call Emma back', 'Restock inner tubes']))
    await waitFor(() => expect(titles(todo)).toEqual(['Price the winter service', 'Order brake pads']))
    // Saved: the task's page says so
    await userEvent.click(within(doing).getByRole('link', { name: /Call Emma back/ }))
    await canvas.findByRole('heading', { name: 'Call Emma back' })
    expect(await canvas.findAllByText('doing')).not.toHaveLength(0)
  },
}

export const TasksRefusedChecks: StoryObj = {
  name: 'A board in rank order, a drop the server refuses (checks)',
  tags: ['play', '!dev'],
  render: () => <Team refuse />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const todo = await column(canvas, 'todo')
    await waitFor(() => expect(titles(todo)).toEqual(['Call Emma back', 'Order brake pads', 'Price the winter service']))
    await moveByKeyboard(within(todo).getAllByRole('link')[0]!, [['{ArrowDown}', 'todo, place 2 of 3']])
    // Put back, with the reason
    expect(await within(document.body).findByText('Could not change the order')).toBeInTheDocument()
    expect(within(document.body).getByText('The record changed since it was read; fetch it again')).toBeInTheDocument()
    await waitFor(() => expect(titles(todo)).toEqual(['Call Emma back', 'Order brake pads', 'Price the winter service']))
  },
}

export const TasksUndoChecks: StoryObj = {
  ...Tasks,
  name: 'A board in rank order, a drop undone (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const todo = await column(canvas, 'todo')
    await waitFor(() => expect(titles(todo)).toEqual(['Call Emma back', 'Order brake pads', 'Price the winter service']))
    await moveByKeyboard(within(todo).getAllByRole('link')[0]!, [
      ['{ArrowRight}', 'doing, place 1 of 3'],
      ['{ArrowDown}', 'doing, place 2 of 3'],
    ])
    const doing = await column(canvas, 'doing')
    await waitFor(() => expect(titles(doing)).toEqual(['Fix the stand clamp', 'Call Emma back', 'Restock inner tubes']))
    // Undo puts back its column and every rank the drop changed
    expect(await within(document.body).findByText('Moved to doing')).toBeInTheDocument()
    await userEvent.click(within(document.body).getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(titles(todo)).toEqual(['Call Emma back', 'Order brake pads', 'Price the winter service']))
    await waitFor(() => expect(titles(doing)).toEqual(['Fix the stand clamp', 'Restock inner tubes']))
  },
}

const handles = (grid: HTMLElement) => within(grid).getAllByRole('button', { name: /^Move / }).map((handle) => handle.getAttribute('aria-label')!.slice('Move '.length))

export const TableDragChecks: StoryObj = {
  name: 'The table in rank order, its rows dragged without Reorder (checks)',
  tags: ['play', '!dev'],
  render: () => <Team start="/tasks?display=table" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const grid = await canvas.findByRole('grid')
    await waitFor(() => expect(handles(grid).slice(0, 3)).toEqual(['Call Emma back', 'Fix the stand clamp', 'Clean the workshop']))
    expect(canvas.queryByRole('button', { name: 'Reorder' })).toBeNull()
    const handle = within(grid).getByRole('button', { name: 'Move Clean the workshop' })
    handle.focus()
    await userEvent.keyboard(' ')
    await waitFor(() => expect(within(document.body).getByText('is over row ', { exact: false })).toBeInTheDocument())
    await userEvent.keyboard('{ArrowUp}{ArrowUp}')
    await waitFor(() => expect(within(document.body).getByText('is over row 1 of 7.', { exact: false })).toBeInTheDocument())
    await userEvent.keyboard(' ')
    await waitFor(() => expect(handles(grid).slice(0, 3)).toEqual(['Clean the workshop', 'Call Emma back', 'Fix the stand clamp']))
    expect(await within(document.body).findByText('Order changed')).toBeInTheDocument()
    await userEvent.click(within(document.body).getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(handles(grid).slice(0, 3)).toEqual(['Call Emma back', 'Fix the stand clamp', 'Clean the workshop']))
    // Sorted another way, it is the list's own table again
    await userEvent.click(within(grid).getByRole('button', { name: 'Status' }))
    expect(await canvas.findByRole('button', { name: 'Reorder' })).toBeInTheDocument()
    expect(within(canvas.getByRole('grid')).queryAllByRole('button', { name: /^Move / })).toHaveLength(0)
  },
}
