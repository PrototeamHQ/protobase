import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, within } from 'storybook/test'
import { createStaticSession } from '@protobase/client'
import type { ActionModel, ViewModel } from '@protobase/schema'
import { App } from '../../app'
import { fakeApi } from '../../testing/fake-api'
import { overview } from './update-inputs-page'
import { salesResources, salesRows, salesViews } from '../guide/sales-domain'

const meta = { title: 'Pages/Update with inputs', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'story', email: 'sam@veldhuis.example', name: 'Sam Veldhuis', role: 'admin' })

const renumber: ActionModel = { name: 'renumber', label: 'Renumber', bulk: false, inputs: [{ name: 'number', kind: 'text', label: 'Number', required: true }], run: { kind: 'update', values: { number: '{number}' } } }

const views: ViewModel[] = salesViews.map((view) => (view.resource === 'orders' ? { ...view, actions: [...view.actions, renumber] } : view))

const Dashboard = () => {
  const [api] = useState(() => fakeApi({ resources: salesResources, views, pages: [overview.toModel()], rows: salesRows }))
  return (
    <div className="h-screen">
      <App client={api.client} auth={session} initialUrl="/overview" workspace="Veldhuis Supply" />
    </div>
  )
}

/** A button on a composed page asks for the answer and saves it on the record. */
export const AnswerInPlace: StoryObj = {
  render: () => <Dashboard />,
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const card = within(await canvas.findByRole('region', { name: 'Biggest unpaid delivery' }))
    expect(await card.findByText('SO-2045')).toBeVisible()
    await userEvent.click(card.getByRole('button', { name: 'Renumber' }))
    const dialog = within(await within(document.body).findByRole('dialog', { name: 'Renumber' }))
    const number = dialog.getByRole('textbox')
    await userEvent.clear(number)
    await userEvent.type(number, 'SO-9000')
    await userEvent.click(dialog.getByRole('button', { name: 'Renumber' }))
    expect(await card.findByText('SO-9000')).toBeVisible()
  },
}
