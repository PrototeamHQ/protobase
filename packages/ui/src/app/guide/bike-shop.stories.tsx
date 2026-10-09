import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { createStaticSession } from '@protobase/client'
import type { ViewModel } from '@protobase/schema'
import { customers, repairs } from '../../../../../docs-examples/bike-shop/data'
import { customerRows, repairRows } from '../../../../../docs-examples/bike-shop/rows'
import * as step1 from '../../../../../docs-examples/bike-shop/step-1'
import * as step2 from '../../../../../docs-examples/bike-shop/step-2'
import * as step3 from '../../../../../docs-examples/bike-shop/step-3'
import * as step4 from '../../../../../docs-examples/bike-shop/step-4'
import * as step5 from '../../../../../docs-examples/bike-shop/step-5'
import { App } from '../app'
import { fakeApi } from '../testing/fake-api'

// The "From a table to an admin" guide on docs.protobase.net embeds these, one per step.

const meta = { title: 'Guides/Bike shop', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const deskSession = createStaticSession('story-token', { id: 'pip', email: 'pip@bikeshop.example', name: 'Pip', role: 'admin' })

const ShopApp = ({ views, start }: { views: Array<{ toModel(): ViewModel }>; start: string }) => {
  const [api] = useState(() => fakeApi({ resources: [customers.toModel(), repairs.toModel()], views: views.map((entry) => entry.toModel()), rows: { customers: customerRows, repairs: repairRows } }))
  return (
    <div className="h-screen">
      <App client={api.client} auth={deskSession} initialUrl={start} workspace="Pip's bike shop" />
    </div>
  )
}

export const Step1: StoryObj = { name: '1. The table, as it is', render: () => <ShopApp views={[step1.customersView, step1.repairsView]} start="/repairs" /> }

export const Step2: StoryObj = { name: '2. Names and columns', render: () => <ShopApp views={[step2.customersView, step2.repairsView]} start="/repairs" /> }

export const Step3: StoryObj = { name: '3. Filters', render: () => <ShopApp views={[step3.customersView, step3.repairsView]} start="/repairs" /> }

export const Step4: StoryObj = { name: '4. The repair card', render: () => <ShopApp views={[step4.customersView, step4.repairsView]} start="/repairs/3" /> }

export const Step5: StoryObj = { name: '5. Daily moves', render: () => <ShopApp views={[step5.customersView, step5.repairsView]} start="/repairs/3" /> }

export const Step5Workshop: StoryObj = { name: '5. The workshop’s view', render: () => <ShopApp views={[step5.customersView, step5.workshopRepairsView]} start="/repairs" /> }

const rowsText = (canvas: ReturnType<typeof within>) => canvas.findByText(/^\d+ rows$/)

/** The record page's status dropdown (the search box is a combobox too). */
const statusSelect = (canvas: ReturnType<typeof within>) => canvas.getAllByRole('combobox').find((element: HTMLElement): element is HTMLSelectElement => element instanceof HTMLSelectElement)!

/** The grid's column headings, from its header row. */
const headings = async (canvas: ReturnType<typeof within>) => {
  const [header] = await canvas.findAllByRole('row')
  return header!.textContent ?? ''
}

export const Step1Checks: StoryObj = {
  ...Step1,
  name: '1. The table, as it is (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(await canvas.findByRole('heading', { name: 'Repairs' })).toBeVisible()
    expect(await canvas.findByText('Rear brake squeals')).toBeVisible()
    expect((await rowsText(canvas)).textContent).toBe('14 rows')
  },
}

export const Step2Checks: StoryObj = {
  ...Step2,
  name: '2. Names and columns (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(await canvas.findByRole('button', { name: /New repair$/ })).toBeVisible()
    await waitFor(() => expect(canvas.getAllByRole('row')[1]).toHaveTextContent('R-312'))
    expect(await headings(canvas)).toMatch(/Booked on/)
    expect(await headings(canvas)).not.toMatch(/Problem/)
  },
}

export const Step3Checks: StoryObj = {
  ...Step3,
  name: '3. Filters (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect((await rowsText(canvas)).textContent).toBe('14 rows')
    await userEvent.click(await canvas.findByRole('switch', { name: 'Paid' }))
    await waitFor(() => expect(canvas.getByText(/^\d+ rows$/).textContent).toBe('6 rows'))
  },
}

export const Step4Checks: StoryObj = {
  ...Step4,
  name: '4. The repair card (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(await canvas.findByRole('heading', { name: 'R-303' })).toBeVisible()
    for (const section of ['The bike', 'In the workshop', 'Money']) expect(canvas.getByRole('heading', { name: section })).toBeVisible()
    expect(canvas.getByText('Pick up a repair by putting your name on it.')).toBeVisible()
    expect(canvas.getByText('Workshop notes')).toBeVisible()
  },
}

export const Step5Checks: StoryObj = {
  ...Step5,
  name: '5. Daily moves (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByRole('heading', { name: 'R-303' })
    await userEvent.click(canvas.getByRole('button', { name: 'Ready for pickup' }))
    await waitFor(() => expect(statusSelect(canvas).value).toBe('ready'))
    await userEvent.click(canvas.getByRole('button', { name: 'Collected and paid' }))
    await userEvent.click(within(await canvas.findByRole('dialog', { name: 'Collected and paid?' })).getByRole('button', { name: 'Collected and paid' }))
    await waitFor(() => expect(statusSelect(canvas).value).toBe('collected'))
    await userEvent.click(canvas.getByRole('button', { name: 'Other repairs of this customer' }))
    await waitFor(() => expect(canvas.getByText(/^\d+ rows$/).textContent).toBe('3 rows'))
  },
}

export const Step5WorkshopChecks: StoryObj = {
  ...Step5Workshop,
  name: '5. The workshop’s view (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() => expect(canvas.getAllByRole('row')[1]).toHaveTextContent('R-313'))
    expect(await headings(canvas)).toMatch(/Problem/)
    expect(canvas.queryByText('Estimate')).toBeNull()
  },
}
