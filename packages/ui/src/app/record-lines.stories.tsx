import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { ApiError, createStaticSession } from '@protobase/client'
import { App } from './app'
import { fakeInvoiceClient } from './testing/fake-invoice-client'

const session = createStaticSession('story-token', { id: 'story', email: 'story@example.test', name: 'Story User', role: 'user' })

const meta = {
  title: 'Record/Reordering lines',
  parameters: { layout: 'fullscreen' },
  // Unsaved changes are kept in local storage; start every story without any.
  beforeEach: () => {
    for (const key of Object.keys(localStorage)) if (key.startsWith('protobase:draft:')) localStorage.removeItem(key)
  },
} satisfies Meta
export default meta

type Handle = { canvas: ReturnType<typeof within> }

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const render = (fake: ReturnType<typeof fakeInvoiceClient>) => () => (
  <div className="h-screen">
    <App client={fake.client} auth={session} initialUrl="/invoices/i1" />
  </div>
)

/** Picks up the first line with the keyboard and drops it one place down: A B C becomes B A C. */
const moveFirstLineDown = async (canvas: Handle['canvas']) => {
  const handle = await canvas.findByRole('button', { name: 'Drag to reorder Line A' })
  handle.focus()
  await userEvent.keyboard(' ')
  await pause(150)
  await userEvent.keyboard('{ArrowDown}')
  await pause(150)
  await userEvent.keyboard(' ')
  await waitFor(() => expect(canvas.getAllByRole('button', { name: /Drag to reorder/ })[0]).toHaveAccessibleName('Drag to reorder Line B'))
}

const saved = fakeInvoiceClient()
export const ReorderThenSave: StoryObj = {
  tags: ['play'],
  render: render(saved),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await moveFirstLineDown(canvas)
    expect((await canvas.findAllByText('Unsaved changes')).length).toBeGreaterThan(0)
    expect(saved.batches).toHaveLength(0)
    await userEvent.click(canvas.getAllByRole('button', { name: 'Save' })[0]!)
    await waitFor(() => expect(saved.batches).toHaveLength(1))
    expect(saved.batches[0]).toEqual([{ op: 'reorder', resource: 'invoiceLines', field: 'position', keys: ['l2', 'l1', 'l3'], etags: { l2: '"l2-v1"', l1: '"l1-v1"', l3: '"l3-v1"' } }])
  },
}

const discarded = fakeInvoiceClient()
export const DiscardGoesBackToTheSavedOrder: StoryObj = {
  tags: ['play'],
  render: render(discarded),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await moveFirstLineDown(canvas)
    await userEvent.click(canvas.getAllByRole('button', { name: 'Discard' })[0]!)
    await waitFor(() => expect(canvas.getAllByRole('button', { name: /Drag to reorder/ })[0]).toHaveAccessibleName('Drag to reorder Line A'))
    expect(canvas.queryAllByText('Unsaved changes')).toHaveLength(0)
    expect(discarded.batches).toHaveLength(0)
  },
}

const guarded = fakeInvoiceClient()
export const LeavingAsksFirst: StoryObj = {
  tags: ['play'],
  render: render(guarded),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await moveFirstLineDown(canvas)
    await userEvent.click(within(canvas.getByRole('navigation', { name: 'Resources' })).getByRole('link', { name: 'Invoices' }))
    const dialog = await canvas.findByRole('dialog', { name: 'Leave without saving?' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Stay' }))
    await waitFor(() => expect(canvas.queryByRole('dialog', { name: 'Leave without saving?' })).toBeNull())
    expect(canvas.getAllByRole('button', { name: /Drag to reorder/ })[0]).toHaveAccessibleName('Drag to reorder Line B')
  },
}

const backed = fakeInvoiceClient()
/** Uses the real browser history: a previous page, then the record on top of it. */
const renderOnHistory = (fake: ReturnType<typeof fakeInvoiceClient>) => () => {
  window.history.replaceState({ protobaseIndex: 0 }, '', '/invoices')
  window.history.pushState({ protobaseIndex: 1 }, '', '/invoices/i1')
  return (
    <div className="h-screen">
      <App client={fake.client} auth={session} />
    </div>
  )
}
const pathname = () => window.location.pathname

export const BackAsksFirst: StoryObj = {
  tags: ['play'],
  render: renderOnHistory(backed),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await moveFirstLineDown(canvas)
    window.history.back()
    const dialog = await canvas.findByRole('dialog', { name: 'Leave without saving?' })
    await waitFor(() => expect(pathname()).toBe('/invoices/i1'))

    await userEvent.click(within(dialog).getByRole('button', { name: 'Stay' }))
    await waitFor(() => expect(canvas.queryByRole('dialog', { name: 'Leave without saving?' })).toBeNull())
    expect(pathname()).toBe('/invoices/i1')
    expect(canvas.getAllByRole('button', { name: /Drag to reorder/ })[0]).toHaveAccessibleName('Drag to reorder Line B')

    window.history.back()
    await userEvent.click(within(await canvas.findByRole('dialog', { name: 'Leave without saving?' })).getByRole('button', { name: 'Leave' }))
    await waitFor(() => expect(pathname()).toBe('/invoices'))
  },
}

const failing = fakeInvoiceClient({ failBatch: () => new ApiError({ type: 'urn:protobase:problem:invalid-record', title: 'Bad Request', status: 400, detail: 'Position 2 is taken.', operation: 0 }) })
export const FailureNamesTheOperation: StoryObj = {
  tags: ['play'],
  render: render(failing),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await moveFirstLineDown(canvas)
    await userEvent.click(canvas.getAllByRole('button', { name: 'Save' })[0]!)
    expect(await canvas.findByText('Could not save')).toBeInTheDocument()
    expect(canvas.getByText('Operation 1 (reorder invoiceLines by position) failed: Position 2 is taken. Nothing was saved.')).toBeInTheDocument()
    expect(canvas.getAllByRole('button', { name: /Drag to reorder/ })[0]).toHaveAccessibleName('Drag to reorder Line B')
  },
}
