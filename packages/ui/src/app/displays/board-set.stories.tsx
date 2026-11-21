import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { ApiError, createStaticSession, type Client } from '@protobase/client'
import { f, resource, view } from '@protobase/schema'
import { App } from '../app'
import { fakeApi } from '../testing/fake-api'

const meta = { title: 'List page/Board by another field', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'pip', email: 'pip@bikeshop.example', name: 'Pip', role: 'admin' })

// A task's status is the database's: running once started, parked while it waits for a day, else its lane
const tasks = resource('tasks')
  .table('tasks')
  .fields({
    id: f.integer().readOnly().filterable().sortable().dbDefault(),
    title: f.text(),
    lane: f.enum(['parked', 'queued']),
    waits: f.boolean(),
    started: f.boolean(),
    status: f.enum(['parked', 'queued', 'running']).readOnly().filterable().sortable(),
  })
  .primaryKey((r) => r.id)
  .checks({ tasks_parked_by_hand: { label: '{title} waits for a day, so it stays parked.' } })

const tasksView = view<typeof tasks>('tasks')
  .title((r) => r.title)
  .list((r, d) => ({ columns: [r.title, r.status], displays: [d.board({ by: r.status })], default: 'board', drag: { board: { set: 'lane', columns: ['parked', 'queued'] } } }))

type Row = Record<string, unknown>

const statusOf = (task: Row) => (task.started ? 'running' : task.waits ? 'parked' : task.lane)

// What a database trigger would do: refuse to queue a task that waits for a day, naming the check, as the API answers it
const refuse = (name: string, row: Row) => {
  if (name !== 'tasks' || !row.waits || row.lane !== 'queued') return
  const errors = [{ field: '_record', code: 'tasks_parked_by_hand', message: '{title} waits for a day, so it stays parked.' }]
  throw new ApiError({ type: 'urn:protobase:problem:invalid-record', title: 'Bad Request', status: 400, detail: 'The database check tasks_parked_by_hand refused the record', errors })
}

// And keep the status in step with the lane, writing the task again
const afterWrite = (name: string, row: Row) => {
  if (name !== 'tasks') return
  row.status = statusOf(row)
  delete row.etag
}

// The update answers with the ETag its write returned, before the trigger wrote the task again, as the database does
const returning = (client: Client): Client => ({
  ...client,
  update: (async (...args: Parameters<Client['update']>) => ({ ...(await client.update(...args)), etag: '"returned"' })) as Client['update'],
})

const Shop = () => {
  const [api] = useState(() =>
    fakeApi({
      resources: [tasks.toModel()],
      views: [tasksView.toModel()],
      rows: {
        tasks: [
          { id: 1, title: 'Order brake pads', lane: 'queued', waits: false, started: false, status: 'queued' },
          { id: 2, title: 'Call the wheel supplier', lane: 'parked', waits: true, started: false, status: 'parked' },
          { id: 3, title: 'Service Emma\'s bike', lane: 'queued', waits: false, started: true, status: 'running' },
        ],
      },
      beforeWrite: refuse,
      afterWrite,
    }),
  )
  const [client] = useState(() => returning(api.client))
  return (
    <div className="h-screen">
      <App client={client} auth={session} initialUrl="/tasks" workspace="Pip's bike shop" />
    </div>
  )
}

export const Tasks: StoryObj = { name: 'A board whose drops set another field', render: () => <Shop /> }

const column = (canvas: ReturnType<typeof within>, name: string) => canvas.findByRole('region', { name: new RegExp(`^${name}, \\d+$`) })
const titles = (region: HTMLElement) => within(region).queryAllByRole('link').map((link) => link.textContent)
const announced = (text: string) => waitFor(() => expect(within(document.body).getByText(text, { exact: false, ignore: 'a, a *' })).toBeInTheDocument())

// Space picks the card up, each arrow moves it a column, and Space drops it
const move = async (card: HTMLElement, key: '{ArrowLeft}' | '{ArrowRight}', columns: string[]) => {
  card.focus()
  await userEvent.keyboard(' ')
  await announced('is over ')
  for (const name of columns) {
    await userEvent.keyboard(key)
    await announced(`is over ${name}.`)
  }
  await userEvent.keyboard(' ')
}

export const TasksChecks: StoryObj = {
  ...Tasks,
  name: 'A board whose drops set another field, moved with the keyboard (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const parked = await column(canvas, 'parked')
    const queued = await column(canvas, 'queued')
    await waitFor(() => expect(titles(queued)).toEqual(['Order brake pads']))
    // The drop sets the lane, and the card lands where the status the database keeps now puts it
    await move(within(queued).getByRole('link', { name: /Order brake pads/ }), '{ArrowLeft}', ['parked'])
    expect(await within(document.body).findByText('Moved to parked')).toBeInTheDocument()
    await waitFor(() => expect(titles(parked).sort()).toEqual(['Call the wheel supplier', 'Order brake pads']))
    // Undo sends the ETag of the task as read again, not the stale one the update returned
    await userEvent.click(within(document.body).getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(titles(queued)).toEqual(['Order brake pads']))
    // A drop a declared check refuses puts the card back with the check's label, filled with the card's values
    await move(within(parked).getByRole('link', { name: /Call the wheel supplier/ }), '{ArrowRight}', ['queued'])
    expect(await within(document.body).findByText('Call the wheel supplier waits for a day, so it stays parked.')).toBeInTheDocument()
    await waitFor(() => expect(titles(parked)).toEqual(['Call the wheel supplier']))
    // A column the drag does not name takes no card
    const running = await column(canvas, 'running')
    await move(within(queued).getByRole('link', { name: /Order brake pads/ }), '{ArrowRight}', ['running'])
    await announced('Order brake pads was put back.')
    expect(titles(queued)).toEqual(['Order brake pads'])
    expect(titles(running)).toEqual(['Service Emma\'s bike'])
  },
}
