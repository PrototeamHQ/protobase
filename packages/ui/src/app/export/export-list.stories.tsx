import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { createStaticSession } from '@protobase/client'
import { App } from '../app'
import { fakeClient } from '../testing/fake-client'

const meta = { title: 'Export/List', tags: ['play'], parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'story', email: 'story@example.test', name: 'Story User', role: 'user' })

/** Export sits among the list's actions, and beside Delete for the selected rows, which it then offers to export. */
export const ExportFromTheList: StoryObj = {
  render: () => (
    <div className="h-screen">
      <App client={fakeClient({ permissions: { create: true, update: true, delete: true, conditional: [] } })} auth={session} initialUrl="/orders" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByText('SO-1')
    await userEvent.click(canvas.getByRole('button', { name: 'Export' }))
    let dialog = within(await within(document.body).findByRole('dialog', { name: 'Export orders' }))
    expect(dialog.queryByRole('group', { name: 'Rows' })).toBeNull()
    await userEvent.click(dialog.getByRole('button', { name: 'Cancel' }))

    await userEvent.click(canvas.getAllByRole('checkbox', { name: /Select row/ })[1]!)
    expect(canvas.getByRole('button', { name: 'Delete 1' })).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Export 1' }))
    dialog = within(await within(document.body).findByRole('dialog', { name: 'Export orders' }))
    expect(dialog.getByRole('button', { name: 'Selected (1)' })).toHaveAttribute('aria-pressed', 'true')
    expect(dialog.getByRole('status')).toHaveTextContent('Exports 1 selected row.')
  },
}

/** Export and Delete keep the selected rows ticked when their dialog is cancelled. */
export const CancelKeepsTheSelection: StoryObj = {
  render: ExportFromTheList.render,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByText('SO-1')
    const rows = canvas.getAllByRole('checkbox', { name: /Select row/ }).slice(0, 2)
    for (const row of rows) await userEvent.click(row)

    await userEvent.click(canvas.getByRole('button', { name: 'Export 2' }))
    const exporting = within(await within(document.body).findByRole('dialog', { name: 'Export orders' }))
    await userEvent.click(exporting.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(within(document.body).queryByRole('dialog')).toBeNull())
    for (const row of rows) expect(row).toBeChecked()

    await userEvent.click(canvas.getByRole('button', { name: 'Delete 2' }))
    const deleting = within(await within(document.body).findByRole('dialog', { name: /Delete 2/ }))
    await userEvent.click(deleting.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(within(document.body).queryByRole('dialog')).toBeNull())
    for (const row of rows) expect(row).toBeChecked()
    expect(canvas.getByRole('button', { name: 'Delete 2' })).toBeVisible()
  },
}
