import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { createStaticSession } from '@protobase/client'
import { component } from '@protobase/layout'
import { l, type ViewModel } from '@protobase/schema'
import { customers, repairs } from '../../../../docs-examples/bike-shop/data'
import { customerRows, repairRows } from '../../../../docs-examples/bike-shop/rows'
import { customersView } from '../../../../docs-examples/bike-shop/step-5'
import * as workshop from '../../../../docs-examples/reference/workshop'
import { App } from './app'
import { useLayoutRecord } from './pages/record-scope'
import { defineUi } from './pages/project-ui'
import { CustomerRepairs } from './testing/customer-repairs'
import { fakeApi } from './testing/fake-api'
import { RepairBoard } from './testing/repair-board'

const meta = { title: 'Record page/Custom sections', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'pip', email: 'pip@bikeshop.example', name: 'Pip', role: 'admin' })

/** Whether the repair is paid, as a sidebar card of the project's own. */
const PaymentNote = () => <p>{useLayoutRecord()?.record.paid ? 'Paid' : 'Not paid yet'}</p>

const ui = defineUi({ components: { RepairBoard, CustomerRepairs, PaymentNote } })

const Shop = ({ start, repairsView = workshop.repairsView }: { start: string; repairsView?: { toModel(): ViewModel } }) => {
  const [api] = useState(() => fakeApi({ resources: [customers.toModel(), repairs.toModel()], views: [customersView.toModel(), repairsView.toModel()], rows: { customers: customerRows, repairs: repairRows } }))
  return (
    <div className="h-screen">
      <App client={api.client} auth={session} initialUrl={start} ui={ui} workspace="Pip's bike shop" />
    </div>
  )
}

const Payment = component('PaymentNote')
const Unregistered = component('WarrantyCard')
const withSidebar = workshop.repairsView.layout((r) => [
  l.section('The bike', [r.customer_id, r.bike, r.problem]),
  l.custom(Unregistered),
  l.sidebar([r.status, r.estimate]),
  l.custom(Payment, { title: 'Payment', sidebar: true }),
])

export const EarlierRepairs: StoryObj = { name: "The customer's earlier repairs", render: () => <Shop start="/repairs/1" /> }

export const InTheSidebar: StoryObj = { name: 'In the sidebar, and one nobody registered', render: () => <Shop start="/repairs/4" repairsView={withSidebar} /> }

export const EarlierRepairsChecks: StoryObj = {
  ...EarlierRepairs,
  name: "The customer's earlier repairs (checks)",
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByRole('heading', { name: 'R-301' })
    expect(canvas.getByRole('heading', { name: 'Earlier repairs of this customer' })).toBeVisible()
    const earlier = await canvas.findByRole('list', { name: 'Earlier repairs' })
    await waitFor(() => expect(within(earlier).getAllByRole('link').map((link) => link.textContent)).toEqual(['R-307', 'R-313']))
    expect(within(earlier).getAllByRole('link')[0]).toHaveAttribute('href', '/repairs/7')
    // The record page stays the framework's around it: breadcrumbs, the fields and the actions
    expect(within(canvas.getByRole('navigation', { name: 'Breadcrumb' })).getByRole('link', { name: 'Repairs' })).toHaveAttribute('href', '/repairs')
    expect(canvas.getByRole('heading', { name: 'The bike' })).toBeVisible()
    expect(canvas.getByRole('button', { name: 'Ready for pickup' })).toBeVisible()
    await userEvent.click(within(earlier).getAllByRole('link')[0]!)
    await canvas.findByRole('heading', { name: 'R-307' })
    await waitFor(() => expect(within(canvas.getByRole('list', { name: 'Earlier repairs' })).getAllByRole('link').map((link) => link.textContent)).toEqual(['R-301', 'R-313']))
  },
}

export const InTheSidebarChecks: StoryObj = {
  ...InTheSidebar,
  name: 'In the sidebar, and one nobody registered (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByRole('heading', { name: 'R-304' })
    const aside = within(canvasElement.querySelector('aside')!)
    expect(await aside.findByText('Payment')).toBeVisible()
    expect(aside.getByText('Not paid yet')).toBeVisible()
    expect(canvas.getByRole('alert')).toHaveTextContent('No component is registered as WarrantyCard')
  },
}
