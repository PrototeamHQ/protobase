import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { createStaticSession, type ResourcePermissions } from '@protobase/client'
import { appPath } from '@protobase/schema'
import { customers, repairs } from '../../../../../docs-examples/bike-shop/data'
import { customerRows, repairRows } from '../../../../../docs-examples/bike-shop/rows'
import { customersView, repairsView } from '../../../../../docs-examples/bike-shop/step-5'
import { App } from '../app'
import { defineUi } from '../pages/project-ui'
import { BookRepair } from '../testing/book-repair'
import { bookRepair } from '../testing/book-repair-page'
import { fakeApi } from '../testing/fake-api'

const meta = { title: 'Create page/A page of its own', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'pip', email: 'pip@bikeshop.example', name: 'Pip', role: 'admin' })
const ui = defineUi({ components: { BookRepair } })
// The repairs' API refuses creates, as one does whose records only an API function creates.
const noCreate: ResourcePermissions = { create: false, update: true, delete: true, conditional: [] }

// Repairs are booked on the shop's own page; `withPage: false` is a user `/meta` does not give it.
const Shop = ({ start, withPage = true }: { start: string; withPage?: boolean }) => {
  const [api] = useState(() =>
    fakeApi({
      resources: [customers.toModel(), repairs.toModel()],
      views: [customersView.toModel(), repairsView.create({ page: 'book-repair' }).toModel()],
      pages: withPage ? [bookRepair.toModel()] : [],
      rows: { customers: customerRows, repairs: repairRows },
      permissions: { repairs: noCreate },
    }),
  )
  return (
    <div className="h-screen">
      <App client={api.client} auth={session} initialUrl={start} ui={ui} workspace="Pip's bike shop" />
    </div>
  )
}

export const FromTheList: StoryObj = { name: 'New opens the page', render: () => <Shop start="/repairs" /> }

export const FromTheListChecks: StoryObj = {
  ...FromTheList,
  name: 'New opens the page (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const create = await canvas.findByRole('link', { name: 'New repair' })
    expect(create).toHaveAttribute('href', '/repairs/new')
    await userEvent.click(create)
    expect(await canvas.findByRole('heading', { name: 'Book a repair' })).toBeVisible()
    expect(canvas.getByRole('button', { name: 'Book repair' })).toBeDisabled()
    await userEvent.type(canvas.getByRole('textbox', { name: 'Bike' }), 'Gazelle Orange')
    await userEvent.click(canvas.getByRole('radio', { name: /Flat tyre/ }))
    expect(canvas.getByRole('radio', { name: /Flat tyre/ })).toBeChecked()
    expect(canvas.getByDisplayValue('Gazelle Orange')).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Book repair' }))
    await waitFor(() => expect(canvas.queryByRole('heading', { name: 'Book a repair' })).toBeNull())
    expect(canvas.getByDisplayValue('Gazelle Orange')).toBeVisible()
  },
}

export const WithValues: StoryObj = {
  name: 'Answers from the address',
  render: () => <Shop start={appPath({ kind: 'create', resource: 'repairs', values: { bike: 'Cortina U4', kind: 'service' } })} />,
}

export const WithValuesChecks: StoryObj = {
  ...WithValues,
  name: 'Answers from the address (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(await canvas.findByDisplayValue('Cortina U4')).toBeVisible()
    expect(canvas.getByRole('radio', { name: /Service/ })).toBeChecked()
    expect(canvas.getByRole('button', { name: 'Book repair' })).toBeEnabled()
  },
}

export const WithoutThePage: StoryObj = { name: 'Without the page', render: () => <Shop start="/repairs" withPage={false} /> }

export const WithoutThePageChecks: StoryObj = {
  ...WithoutThePage,
  name: 'Without the page (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByText('R-301')
    expect(canvas.queryByRole('link', { name: 'New repair' })).toBeNull()
  },
}

export const NoCreateForm: StoryObj = { name: 'No create form at /repairs/new', render: () => <Shop start="/repairs/new" withPage={false} /> }

export const NoCreateFormChecks: StoryObj = {
  ...NoCreateForm,
  name: 'No create form at /repairs/new (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(await canvas.findByText('Not allowed')).toBeVisible()
    expect(canvas.queryByRole('button', { name: /Create repair/ })).toBeNull()
  },
}
