import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { createStaticSession } from '@protobase/client'
import { App } from './app'
import { fakeClient, forbidden } from './testing/fake-client'

const meta = { title: 'Permissions', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'story', email: 'story@example.test', name: 'Story User', role: 'user' })

const app = (client: ReturnType<typeof fakeClient>) => (
  <div className="h-screen">
    <App client={client} auth={session} initialUrl="/orders" />
  </div>
)

export const ReadOnlyUser: StoryObj = {
  tags: ['play'],
  render: () => app(fakeClient({ permissions: { create: false, update: false, delete: false, conditional: [] } })),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByText('SO-1')
    expect(canvas.queryByRole('button', { name: /New order/ })).toBeNull()
    await userEvent.click(canvas.getAllByRole('button', { name: 'Row actions' })[0]!)
    // The row menu is portalled to the body, outside the canvas
    const page = within(canvasElement.ownerDocument.body)
    expect(await page.findByRole('menuitem', { name: 'Open order' })).toBeVisible()
    expect(page.queryByRole('menuitem', { name: 'Delete' })).toBeNull()
    await userEvent.keyboard('{Escape}')
    await userEvent.click(canvas.getAllByRole('checkbox', { name: /Select row/ })[0]!)
    expect(canvas.queryByRole('button', { name: /Delete \d/ })).toBeNull()
  },
}

export const ConditionalDeleteRefused: StoryObj = {
  tags: ['play'],
  render: () =>
    app(
      fakeClient({
        permissions: { create: false, update: true, delete: false, conditional: ['delete'] },
        remove: async () => {
          throw forbidden('You may only delete orders you own.')
        },
      }),
    ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByText('SO-1')
    expect(canvas.queryByRole('button', { name: /New order/ })).toBeNull()
    await userEvent.click(canvas.getAllByRole('button', { name: 'Row actions' })[0]!)
    await userEvent.click(await within(canvasElement.ownerDocument.body).findByRole('menuitem', { name: 'Delete' }))
    const confirm = await canvas.findByRole('dialog', { name: /Delete SO-1\?/ })
    await userEvent.click(within(confirm).getByRole('button', { name: 'Delete' }))
    expect(await canvas.findByText('Could not delete SO-1')).toBeInTheDocument()
    expect(canvas.getByText('You may only delete orders you own.')).toBeInTheDocument()
    await waitFor(() => expect(canvas.queryByRole('dialog', { name: /Delete SO-1\?/ })).toBeNull())
  },
}
