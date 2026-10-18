import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { createStaticSession } from '@protobase/client'
import { appPath } from '@protobase/schema'
import { customers, repairs } from '../../../../docs-examples/bike-shop/data'
import { repairRows } from '../../../../docs-examples/bike-shop/rows'
import { customersView, repairsView } from '../../../../docs-examples/bike-shop/step-2'
import { App } from './app'
import { fakeApi } from './testing/fake-api'

const meta = { title: 'List page/Empty list', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'pip', email: 'pip@bikeshop.example', name: 'Pip', role: 'admin' })

// The shop with its repairs, and without customers yet.
const Shop = ({ start }: { start: string }) => {
  const [api] = useState(() => fakeApi({ resources: [customers.toModel(), repairs.toModel()], views: [customersView.toModel(), repairsView.toModel()], rows: { customers: [], repairs: repairRows } }))
  return (
    <div className="h-screen">
      <App client={api.client} auth={session} initialUrl={start} />
    </div>
  )
}

export const NoMatch: StoryObj = { name: 'A search that matches nothing', render: () => <Shop start="/repairs" /> }

export const NoMatchChecks: StoryObj = {
  ...NoMatch,
  name: 'A search that matches nothing (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByRole('link', { name: 'R-312' })
    await userEvent.type(canvas.getByRole('textbox', { name: 'Search' }), 'zzzqqq{Enter}')
    await canvas.findByText('No repairs match “zzzqqq”.')
    expect(canvas.queryByRole('grid')).toBeNull()
    expect(canvas.queryByRole('button', { name: 'Clear filters' })).toBeNull()

    // Clearing the search brings the rows back
    await userEvent.click(canvas.getByRole('button', { name: 'Clear search' }))
    await canvas.findByRole('link', { name: 'R-312' })
    await waitFor(() => expect(canvas.getByRole('textbox', { name: 'Search' })).toHaveValue(''))
  },
}

export const NoneYet: StoryObj = { name: 'A resource without records yet', render: () => <Shop start="/customers" /> }

export const NoneYetChecks: StoryObj = {
  ...NoneYet,
  name: 'A resource without records yet (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const empty = (await canvas.findByText('No customers yet.')).parentElement!
    expect(within(empty).getByRole('link', { name: 'New customer' })).toHaveAttribute('href', appPath({ kind: 'create', resource: 'customers' }))
    expect(canvas.queryByRole('button', { name: 'Clear search' })).toBeNull()
  },
}
