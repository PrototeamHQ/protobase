import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { createStaticSession } from '@protobase/client'
import { customers, repairs } from '../../../../../docs-examples/bike-shop/data'
import { customerRows, repairRows } from '../../../../../docs-examples/bike-shop/rows'
import { customersView, repairsView } from '../../../../../docs-examples/bike-shop/step-2'
import { App } from '../app'
import { fakeApi } from '../testing/fake-api'

const meta = { title: 'App/Global search/Opens elsewhere', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'pip', email: 'pip@bikeshop.example', name: 'Pip', role: 'admin' })

// A repair is read on its customer's page, so its record page opens there
const opensCustomer = repairsView.recordOpens([{ kind: 'record', resource: 'customers', key: '{{customer_id}}' }])

// On the browser's own history, so a check can go Back
const Shop = ({ at }: { at: string }) => {
  const [api] = useState(() => {
    window.history.replaceState(null, '', at)
    return fakeApi({ resources: [customers.toModel(), repairs.toModel()], views: [customersView.toModel(), opensCustomer.toModel()], rows: { customers: customerRows, repairs: repairRows } })
  })
  return (
    <div className="h-screen">
      <App client={api.client} auth={session} />
    </div>
  )
}

const at = (path: string) => waitFor(() => expect(`${window.location.pathname}${window.location.search}`).toBe(path))

export const SearchResultLinksToTarget: StoryObj = {
  name: 'A search result links to where its record is read',
  tags: ['play', '!dev'],
  render: () => <Shop at="/customers" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const box = await canvas.findByRole('combobox', { name: 'Global search' })
    await userEvent.type(box, 'hinge')
    const option = await canvas.findByRole('option', { name: /^R-305/ })
    expect(option).toHaveAttribute('href', '/customers/5')
    await userEvent.click(option)
    expect(await canvas.findByRole('heading', { level: 1, name: 'Emma Visser' })).toBeVisible()
    await at('/customers/5')
    // Back returns to where the search was
    window.history.back()
    await at('/customers')
  },
}

export const LinkToRecordIsReplaced: StoryObj = {
  name: "A link to the record's own address opens the target in its place",
  tags: ['play', '!dev'],
  render: () => <Shop at="/repairs" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const link = await within(await canvas.findByRole('grid')).findByRole('link', { name: 'R-305' })
    expect(link).toHaveAttribute('href', '/repairs/5')
    await userEvent.click(link)
    expect(await canvas.findByRole('heading', { level: 1, name: 'Emma Visser' })).toBeVisible()
    await at('/customers/5')
    // The record's address was replaced, so Back skips it
    window.history.back()
    await at('/repairs')
  },
}

export const StandardPageStays: StoryObj = {
  name: "The record's own page stays at its standard address",
  tags: ['play', '!dev'],
  render: () => <Shop at="/repairs/5?standard=true" />,
  play: async ({ canvasElement }) => {
    expect(await within(canvasElement).findByRole('heading', { level: 1, name: 'R-305' })).toBeVisible()
    await at('/repairs/5?standard=true')
  },
}
