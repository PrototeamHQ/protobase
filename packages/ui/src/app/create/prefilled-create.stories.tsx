import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, within } from 'storybook/test'
import { createStaticSession } from '@protobase/client'
import { appPath } from '@protobase/schema'
import { customers, repairs } from '../../../../../docs-examples/bike-shop/data'
import { customerRows, repairRows } from '../../../../../docs-examples/bike-shop/rows'
import { customersView, repairsView } from '../../../../../docs-examples/bike-shop/step-5'
import { App } from '../app'
import { fakeApi } from '../testing/fake-api'

const meta = { title: 'Create page/Prefilled', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'pip', email: 'pip@bikeshop.example', name: 'Pip', role: 'admin' })

// A new repair for Chloé, as a link on her page would open it: her record chosen, the bike typed in.
const Shop = () => {
  const [api] = useState(() => fakeApi({ resources: [customers.toModel(), repairs.toModel()], views: [customersView.toModel(), repairsView.toModel()], rows: { customers: customerRows, repairs: repairRows } }))
  return (
    <div className="h-screen">
      <App client={api.client} auth={session} initialUrl={appPath({ kind: 'create', resource: 'repairs', values: { customer_id: '3', bike: 'Cortina U4' } })} workspace="Pip's bike shop" />
    </div>
  )
}

export const Prefilled: StoryObj = { name: 'Values from the address', render: () => <Shop /> }

export const PrefilledChecks: StoryObj = {
  ...Prefilled,
  name: 'Values from the address (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(await canvas.findByDisplayValue('Cortina U4')).toBeVisible()
    expect(await canvas.findByDisplayValue('Chloé Martin')).toBeVisible()
  },
}
