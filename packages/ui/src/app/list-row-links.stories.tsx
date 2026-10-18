import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { createStaticSession } from '@protobase/client'
import { appPath } from '@protobase/schema'
import { customers, repairs } from '../../../../docs-examples/bike-shop/data'
import { customerRows, repairRows } from '../../../../docs-examples/bike-shop/rows'
import { customersView, repairsView } from '../../../../docs-examples/bike-shop/step-2'
import { App } from './app'
import { fakeApi } from './testing/fake-api'

const meta = { title: 'List page/Row links', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'pip', email: 'pip@bikeshop.example', name: 'Pip', role: 'admin' })

// On the browser's own history, so a check can count the entries a click adds.
const Shop = () => {
  const [api] = useState(() => {
    window.history.replaceState(null, '', '/repairs')
    return fakeApi({ resources: [customers.toModel(), repairs.toModel()], views: [customersView.toModel(), repairsView.toModel()], rows: { customers: customerRows, repairs: repairRows } })
  })
  return (
    <div className="h-screen">
      <App client={api.client} auth={session} />
    </div>
  )
}

// The sidebar links the repairs opened lately too, so the row is looked for in the grid
const firstRow = async (canvasElement: HTMLElement) => (await within(await within(canvasElement).findByRole('grid')).findByRole('link', { name: 'R-312' })).closest<HTMLElement>('[role=row]')!

export const RowLinks: StoryObj = { name: 'A row whose title links to its record', render: () => <Shop /> }

export const RowLinkChecks: StoryObj = {
  ...RowLinks,
  name: 'A row whose title links to its record (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const row = await firstRow(canvasElement)
    const link = within(row).getByRole('link', { name: 'R-312' })
    expect(link).toHaveAttribute('href', appPath({ kind: 'record', resource: 'repairs', key: '12' }))
    expect(document.title).toBe('Repairs · Protobase')

    // A plain click follows the link in place, adding one history entry
    const before = window.history.length
    await userEvent.click(link)
    await canvas.findByRole('heading', { level: 1, name: 'R-312' })
    expect(window.location.pathname).toBe('/repairs/12')
    expect(window.history.length).toBe(before + 1)
    await waitFor(() => expect(document.title).toBe('R-312 · Repairs · Protobase'))

    // Any other cell of the row opens it too
    window.history.back()
    const again = await firstRow(canvasElement)
    await userEvent.click(within(again).getByText('VanMoof S5'))
    await canvas.findByRole('heading', { level: 1, name: 'R-312' })
    expect(window.location.pathname).toBe('/repairs/12')
  },
}
