import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { ApiError, createStaticSession } from '@protobase/client'
import { customers, repairs } from '../../../../../docs-examples/bike-shop/data'
import { customerRows, repairRows } from '../../../../../docs-examples/bike-shop/rows'
import { customersView, repairsView } from '../../../../../docs-examples/bike-shop/step-5'
import { App } from '../app'
import { fakeApi } from '../testing/fake-api'

const meta = { title: 'Create page/Field errors', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'pip', email: 'pip@bikeshop.example', name: 'Pip', role: 'admin' })

// What the server answers a repair without a bike and with an estimate it cannot read
const refusal = new ApiError({
  type: 'urn:protobase:problem:invalid-record',
  title: 'Bad Request',
  status: 400,
  detail: 'The request body is invalid: bike: "bike" is required',
  errors: [
    { field: 'bike', code: 'required', message: '"bike" is required' },
    { field: 'estimate', code: 'invalid-value', message: 'Expected a decimal string with at most 8 digits, 2 after the point', params: { precision: 8, scale: 2 } },
  ],
})

const Shop = () => {
  const [api] = useState(() => {
    const fake = fakeApi({
      resources: [customers.toModel(), repairs.toModel()],
      views: [customersView.toModel(), repairsView.toModel()],
      rows: { customers: customerRows, repairs: repairRows },
    })
    return { ...fake, client: { ...fake.client, create: () => Promise.reject(refusal) } }
  })
  return (
    <div className="h-screen">
      <App client={api.client} auth={session} initialUrl="/repairs/new" workspace="Pip's bike shop" />
    </div>
  )
}

export const Refused: StoryObj = { name: 'A create the server refuses', render: () => <Shop /> }

export const RefusedChecks: StoryObj = {
  ...Refused,
  name: 'A create the server refuses (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // Each label names its field, and clicking it focuses the field
    const estimate = await canvas.findByRole('textbox', { name: 'Estimate' })
    await userEvent.type(estimate, '12,50 abc')
    const bike = canvas.getByRole('textbox', { name: 'Bike' })
    expect(bike).toHaveAttribute('name', 'bike')
    expect(bike).toHaveAttribute('aria-required', 'true')
    const problem = canvas.getByRole<HTMLInputElement>('textbox', { name: 'Problem' })
    await userEvent.click(problem.labels![0]!)
    expect(problem).toHaveFocus()
    expect(problem).toHaveAccessibleDescription('In the customer’s words; the mechanic adds findings to the notes.')

    await userEvent.click(canvas.getByRole('button', { name: 'Create repair' }))
    // The fields say what is wrong in their own words, the banner how many to check, and the first takes focus
    expect(await canvas.findByText('Bike is required')).toBeVisible()
    expect(canvas.getByText('Enter a number with at most 2 decimals, below 1,000,000')).toBeVisible()
    expect(canvas.getByText('Could not save: Check 2 fields.')).toBeVisible()
    await waitFor(() => expect(bike).toHaveFocus())
    expect(bike).toHaveAttribute('aria-invalid', 'true')
    expect(bike).toHaveAccessibleDescription('Bike is required')
    expect(estimate).toHaveAccessibleDescription('Enter a number with at most 2 decimals, below 1,000,000')
  },
}
