import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { ApiError, createStaticSession } from '@protobase/client'
import { customers, repairs } from '../../../../../docs-examples/bike-shop/data'
import { customerRows, repairRows } from '../../../../../docs-examples/bike-shop/rows'
import { customersView, repairsView } from '../../../../../docs-examples/bike-shop/step-5'
import { App } from '../app'
import { fakeApi } from '../testing/fake-api'

const meta = { title: 'Create page/Opening the existing record', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'pip', email: 'pip@bikeshop.example', name: 'Pip', role: 'admin' })

// What the server answers a create that repeats the unique values of repair R-301 under `.openExisting()`
const taken = new ApiError({
  type: 'urn:protobase:problem:conflict',
  title: 'Conflict',
  status: 409,
  detail: 'A record with the same unique value already exists',
  existing: { key: '1' },
})

const Shop = () => {
  const [api] = useState(() => {
    const fake = fakeApi({
      resources: [customers.toModel(), repairs.toModel()],
      views: [customersView.toModel(), repairsView.toModel()],
      rows: { customers: customerRows, repairs: repairRows },
    })
    return { ...fake, client: { ...fake.client, create: () => Promise.reject(taken) } }
  })
  return (
    <div className="h-screen">
      <App client={api.client} auth={session} initialUrl="/repairs/new" workspace="Pip's bike shop" />
    </div>
  )
}

export const Opened: StoryObj = { name: 'A create that repeats an existing record', render: () => <Shop /> }

export const OpenedChecks: StoryObj = {
  ...Opened,
  name: 'A create that repeats an existing record (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.type(await canvas.findByRole('textbox', { name: 'Bike' }), repairRows[0]!.bike)
    await userEvent.click(canvas.getByRole('button', { name: 'Create repair' }))
    // The record it repeats opens as a new one would, with no word of an error
    await waitFor(() => expect(canvas.queryByRole('button', { name: 'Create repair' })).toBeNull())
    expect(await canvas.findByRole('heading', { name: 'R-301' })).toBeVisible()
    const page = within(canvasElement.ownerDocument.body)
    await waitFor(() => expect(page.queryByText(/Saving new repair/)).toBeNull())
    expect(page.queryByText('Could not save')).toBeNull()
  },
}
